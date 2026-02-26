module.exports = {
    routes: [
        {
            method: "POST",
            path: "/orders/checkout",
            handler: "order.createCheckoutSession",
            config: {
                auth: false, // For testing, you can change to `{}` to require JWT
            },
        },
        {
            method: "POST",
            path: "/orders/webhook",
            handler: "order.stripeWebhook",
            config: {
                auth: false, // Webhooks must be public
            },
        },
        {
            method: "GET",
            path: "/orders/me",
            handler: "order.getMyOrders",
            config: {
                auth: {}, // Require JWT
            },
        },
        {
            method: "POST",
            path: "/orders/preorder",
            handler: "order.createPreOrder",
            config: {
                auth: false, // Allow public pre-orders (or change to `{}` if mandatory login)
            },
        },
    ],
};
