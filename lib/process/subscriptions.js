'use strict';
/*
 * This will process any changes to an account's subscription.
 * */
module.exports = function init(thorin, opt) {
  const hooker = require('../eventHook')(),
    logger = thorin.logger(opt.logger),
    storeObj = thorin.store(opt.store),
    StripeSubscription = storeObj.model(storeObj.camelize(opt.models.subscription)),
    StripePlan = storeObj.model(storeObj.camelize(opt.models.plan)),
    Account = storeObj.model(storeObj.camelize(opt.models.account));

  /*
   * When a subscription is created, we set it
   * */
  hooker.addHook(
    'customer.subscription.updated',
    'customer.subscription.deleted',
    (subscription, next, eventName) => {
      let calls = [],
        subscriptionObj = null,
        accountObj;

      // read the account
      calls.push((stop) => {
        if (!subscription.customer) return stop();
        const qry = {};
        qry[opt.fields.customer] = subscription.customer;
        return Account.find({
          where: qry
        }).then((aObj) => {
          if (!aObj) return stop();
          accountObj = aObj;
        });
      });

      // read the subscription
      calls.push((stop) => {
        const qry = {
          stripe_subscription_key: subscription.id
        };
        qry[opt.models.account + "_id"] = accountObj.id;
        return StripeSubscription.find({
          where: qry
        }).then((sObj) => {
          if (!sObj) return stop();
          subscriptionObj = sObj;
        });
      });

      // update the subscription
      calls.push(() => {
        subscriptionObj.set('status', subscription.status);
        subscriptionObj.set('quantity', subscription.quantity);
        subscriptionObj.set('period_start', new Date(subscription.current_period_start * 1000));
        subscriptionObj.set('period_end', new Date(subscription.current_period_end * 1000));
        if(eventName === 'customer.subscription.deleted') {
          subscriptionObj.set('is_active', false);
          subscriptionObj.set('deactivated_at', new Date());
        }
        return subscriptionObj.save();
      });

      // Check if the subscription was cancelled. If so, we remove the plan_id from the account
      if(subscription.status === 'canceled') {
        let defaultPlanId = null;
        if(opt.defaultPlan) {
          calls.push(() => {
            return StripePlan.find({
              where: {
                code: opt.defaultPlan
              },
              attributes: ['id', 'code']
            }).then((pObj) => {
              if(!pObj) return;
              defaultPlanId = pObj.id;
            });
          });
        }
        calls.push(() => {
          if(subscription.status !== 'canceled') return;
          let oldPlan = accountObj.get(opt.models.plan + "_id");
          accountObj.set(opt.models.plan + '_id', defaultPlanId);
          return accountObj.save().then(() => {
            logger.info(`Account ${accountObj.id} downgraded from plan ${oldPlan}, subscription cancelled.`);
          });
        });
      }

      thorin.series(calls, (err) => {
        if(err) return next(err);
        if(subscriptionObj) {
          logger.trace(`stripe.process.subscription: subscription ${subscriptionObj.id} processed with status: ${subscriptionObj.status} [${eventName}]`, {
            tags: ['stripe.process.subscription']
          });
        }
        next();
      });
    });

}