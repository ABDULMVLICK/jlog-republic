'use strict';

const stripeApiKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeApiKey ? require('stripe')(stripeApiKey) : null;
const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::order.order', ({ strapi }) => ({
    async createCheckoutSession(ctx) {
        if (!stripe) {
            strapi.log.error('STRIPE_SECRET_KEY is not set; checkout functionality is disabled.');
            ctx.response.status = 500;
            return { error: 'Stripe is not configured on the server.' };
        }

        try {
            const { products } = ctx.request.body;
            // ... existing validation ...
            if (!Array.isArray(products) || products.length === 0) {
                ctx.response.status = 400;
                return { error: 'No products provided' };
            }

            // Normalisation / validation des entrées: on ne fait pas confiance au prix côté client
            const sanitized_items = products.map((product, index) => {
                const quantity = Number(product.quantity);

                if (!product.id || !Number.isInteger(quantity) || quantity <= 0) {
                    throw Object.assign(new Error('Invalid product item'), {
                        statusCode: 400,
                        details: { index },
                    });
                }

                return {
                    id: product.id,
                    quantity,
                };
            });

            // Récupération des vrais produits en base pour obtenir le prix réel
            const product_ids = sanitized_items.map((item) => item.id);
            const db_products = await strapi.entityService.findMany('api::product.product', {
                filters: { id: { $in: product_ids } },
                fields: ['id', 'name', 'price'],
            });

            if (!db_products || db_products.length !== sanitized_items.length) {
                ctx.response.status = 400;
                return { error: 'One or more products are invalid' };
            }

            const db_product_map = new Map(
                db_products.map((p) => [String(p.id), p]),
            );

            const order_products_snapshot = [];
            let totalAmount = 0;

            // Construction des line_items Stripe à partir des données de la base
            const lineItems = sanitized_items.map((item) => {
                const db_product = db_product_map.get(String(item.id));

                if (!db_product) {
                    throw Object.assign(new Error('Product not found'), {
                        statusCode: 400,
                        details: { id: item.id },
                    });
                }

                const unit_price_number = Number(db_product.price);

                if (!Number.isFinite(unit_price_number) || unit_price_number <= 0) {
                    throw Object.assign(new Error('Invalid product price'), {
                        statusCode: 500,
                        details: { id: item.id },
                    });
                }

                const unit_amount_cents = Math.round(unit_price_number * 100);

                totalAmount += unit_price_number * item.quantity;

                order_products_snapshot.push({
                    product_id: db_product.id,
                    name: db_product.name,
                    unit_price: unit_price_number,
                    quantity: item.quantity,
                });

                return {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: db_product.name,
                        },
                        unit_amount: unit_amount_cents, // Stripe attend des montants en centimes
                    },
                    quantity: item.quantity,
                };
            });

            // Create a Checkout Session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'payment',
                // Update these URLs to point to your frontend
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout?success=true`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout?canceled=true`,
            });

            // Save order in Strapi as 'pending'
            await strapi.documents('api::order.order').create({
                data: {
                    stripeId: session.id,
                    products: order_products_snapshot,
                    totalAmount: totalAmount,
                    status: 'pending',
                    user: ctx.state.user?.id // Link user if authenticated
                }
            });

            return { checkoutUrl: session.url, sessionId: session.id };
        } catch (err) {
            if (err && err.statusCode) {
                ctx.response.status = err.statusCode;
                return { error: err.message, details: err.details };
            }

            console.error(err);
            ctx.response.status = 500;
            return { error: 'Could not create checkout session' };
        }
    },

    async getMyOrders(ctx) {
        try {
            const user = ctx.state.user;

            if (!user) {
                ctx.response.status = 401;
                return { error: 'You must be logged in to view your orders' };
            }

            const orders = await strapi.entityService.findMany('api::order.order', {
                filters: { user: user.id },
                sort: { createdAt: 'desc' },
            });

            return { data: orders };
        } catch (err) {
            console.error(err);
            ctx.response.status = 500;
            return { error: 'Could not fetch orders' };
        }
    },

    async createPreOrder(ctx) {
        try {
            const { products, shippingDetails } = ctx.request.body;

            if (!Array.isArray(products) || products.length === 0) {
                ctx.response.status = 400;
                return { error: 'No products provided' };
            }

            // Calculate total amount based on DB prices
            const product_ids = products.map((item) => item.id);
            const db_products = await strapi.entityService.findMany('api::product.product', {
                filters: { id: { $in: product_ids } },
                fields: ['id', 'name', 'price'],
            });

            const db_product_map = new Map(db_products.map((p) => [String(p.id), p]));
            let totalAmount = 0;
            const order_products_snapshot = [];

            products.forEach((item) => {
                const db_p = db_product_map.get(String(item.id));
                if (db_p) {
                    totalAmount += Number(db_p.price) * item.quantity;
                    order_products_snapshot.push({
                        product_id: db_p.id,
                        name: db_p.name,
                        unit_price: Number(db_p.price),
                        quantity: item.quantity,
                    });
                }
            });

            // Create preorder record
            const order = await strapi.documents('api::order.order').create({
                data: {
                    products: order_products_snapshot,
                    totalAmount: totalAmount,
                    status: 'preorder',
                    user: ctx.state.user?.id,
                    ...shippingDetails, // Spreads firstName, lastName, email, etc.
                }
            });

            return { data: order };
        } catch (err) {
            console.error(err);
            ctx.response.status = 500;
            return { error: 'Could not create pre-order' };
        }
    },

    async stripeWebhook(ctx) {
        if (!stripe) {
            strapi.log.error('STRIPE_SECRET_KEY is not set; Stripe webhook is disabled.');
            ctx.response.status = 500;
            return { error: 'Stripe webhook not configured' };
        }

        // Webhook sécurisé Stripe: vérifie la signature et met à jour les commandes.
        const signature = ctx.request.headers['stripe-signature'];
        const endpoint_secret = process.env.STRIPE_WEBHOOK_SECRET;
        const raw_body = ctx.request.body[Symbol.for('unparsedBody')];

        if (!endpoint_secret) {
            strapi.log.error('STRIPE_WEBHOOK_SECRET is not set; Stripe webhook is disabled for security.');
            ctx.response.status = 500;
            return { error: 'Stripe webhook not configured' };
        }

        if (!signature || !raw_body) {
            ctx.response.status = 400;
            return { error: 'Missing Stripe signature or raw body' };
        }

        let event;

        try {
            event = stripe.webhooks.constructEvent(raw_body, signature, endpoint_secret);
        } catch (err) {
            strapi.log.warn(`Stripe webhook signature verification failed: ${err.message}`);
            ctx.response.status = 400;
            return { error: 'Invalid Stripe signature' };
        }

        try {
            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;

                // On retrouve la commande associée à cette session Stripe via stripeId
                const orders = await strapi.entityService.findMany('api::order.order', {
                    filters: { stripeId: session.id },
                    limit: 1,
                });

                if (!orders || orders.length === 0) {
                    strapi.log.warn(`No order found for Stripe session ${session.id}`);
                } else {
                    const order = orders[0];

                    await strapi.entityService.update('api::order.order', order.id, {
                        data: {
                            status: 'paid',
                        },
                    });
                }
            } else {
                // Pour les autres événements, on log simplement pour suivi
                strapi.log.info(`Unhandled Stripe event type: ${event.type}`);
            }
        } catch (err) {
            strapi.log.error(`Error while handling Stripe webhook event ${event.type}: ${err.message}`);
            ctx.response.status = 500;
            return { error: 'Error while processing Stripe webhook' };
        }

        return { received: true };
    }
}));
