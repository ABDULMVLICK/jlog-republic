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
});
