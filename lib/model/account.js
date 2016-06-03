'use strict';
/*
 * Alters the account model to include subscription functionality
 * */
module.exports = function(thorin, opt, storeObj, stripe) {
  let AccountModel = storeObj.model(opt.models.account),
    logger = thorin.logger(opt.logger),
    Seq = storeObj.getSequelize();
  // Check if we have to attach the stripe_plan_id field
  let planId = opt.models.plan + '_id',
    planModel = storeObj.camelize(opt.models.plan),
    subscriptionId = opt.models.subscription + '_id',
    subscriptionModel = storeObj.camelize(opt.models.subscription);
  if (!AccountModel.field[planId]) {
    let fieldOpt = {
      create: false,
      update: false,
      filter: false
    };
    AccountModel.belongsTo(storeObj.camelize(opt.models.plan), {
      as: 'plan',
      constraints: false,
      foreignKey: planId
    });

  }
  // Check if we have to attach the stripe_customer_id field
  if (!AccountModel.field[opt.fields.customer]) {
    let fieldOpt = {
      create: false,
      update: false,
      filter: false
    };
    AccountModel.field(opt.fields.customer, Seq.STRING(250), {
      defaultValue: null,
      allowNull: true
    });
  }

  /*
   * Returns the active subscription of a user.
   * Options:
   *   - plan: true  => reads the plan also
   * */
  AccountModel
    .method('isStripeCustomer', function isStripeCustomer() {
      if(!this.get(opt.fields.customer)) return false;
      return true;
    })
    .method('getStripeCustomer', function getStripeCustomer() {
      if(!this.get(opt.fields.customer)) return null;
      return this.get(opt.fields.customer);
    })
    .method('getSubscription', function getActiveSubscription(options) {
      const StripeSubscription = storeObj.model(subscriptionModel),
        StripePlan = storeObj.model(planModel);
      return new Promise((resolve, reject) => {
        if (!this[planId]) { // we do not have any plan associated.
          return resolve(null);
        }
        const qry = {
          where: {
            is_active: true,
            period_end: {
              gte: Date.now()
            }
          },
          order: [['created_at', 'DESC']]
        };
        qry.where[opt.models.account + '_id'] = this.id;
        qry.where[planId] = this[planId];
        if (options && options.plan) {
          qry.include = [{
            model: StripePlan,
            as: storeObj.camelize(opt.models.plan),
            required: true
          }];
        }
        StripeSubscription.find(qry).then((subObj) => {
          if (!subObj) {
            return resolve(null);
          }
          resolve(subObj);
        }).catch((e) => {
          logger.warn(`Could not read subscription of account ${this.id}`);
          logger.debug(e);
          reject(thorin.error(e));
        });
      });
    });
}