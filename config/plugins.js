module.exports = ({ env }) => ({
    email: {
        config: {
            provider: '@strapi/provider-email-nodemailer',
            providerOptions: {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: env('SMTP_EMAIL'),
                    pass: env('SMTP_PASSWORD'),
                },
            },
            settings: {
                defaultFrom: env('SMTP_EMAIL'),
                defaultReplyTo: env('SMTP_EMAIL'),
            },
        },
    },
    // Render free = disque éphémère : les uploads locaux disparaissent à chaque
    // restart. Cloudinary (gratuit) rend les médias persistants.
    ...(env('CLOUDINARY_NAME')
        ? {
            upload: {
                config: {
                    provider: 'cloudinary',
                    providerOptions: {
                        cloud_name: env('CLOUDINARY_NAME'),
                        api_key: env('CLOUDINARY_KEY'),
                        api_secret: env('CLOUDINARY_SECRET'),
                    },
                    actionOptions: {
                        upload: {},
                        uploadStream: {},
                        delete: {},
                    },
                },
            },
        }
        : {}),
});
