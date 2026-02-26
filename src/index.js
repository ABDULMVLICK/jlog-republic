'use strict';

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) { },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    try {
      // Give public access to product and category
      const publicRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'public' } });

      if (publicRole) {
        const permissions = [
          'api::product.product.find',
          'api::product.product.findOne',
          'api::category.category.find',
          'api::category.category.findOne',
        ];

        await Promise.all(
          permissions.map(async (action) => {
            const permission = await strapi
              .query('plugin::users-permissions.permission')
              .findOne({
                where: {
                  action,
                  role: publicRole.id,
                },
              });

            if (!permission) {
              await strapi.query('plugin::users-permissions.permission').create({
                data: {
                  action,
                  role: publicRole.id,
                },
              });
            }
          })
        );
      }
    } catch (error) {
      console.error('Bootstrap permission setup failed:', error);
    }
  },
};
