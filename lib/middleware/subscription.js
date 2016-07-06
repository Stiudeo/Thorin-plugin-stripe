'use strict';
/*
 * Registers the stripe plan middleware.
 * */
module.exports = function(thorin, opt, stripe) {
  const logger = thorin.logger(opt.logger + '.subscribe'),
    storeObj = thorin.store(opt.store),
    dispatcher = thorin.dispatcher,
    subscriptionModel = storeObj.camelize(opt.models.subscription),
    planModel = storeObj.camelize(opt.models.plan),
    accountModel = storeObj.camelize(opt.models.account);


  /*
  * Reads the current account's subscription and plan, placing it under
  * intentObj.data("currentPlan") and intentObj.data("currentSubscription")
  * */
  dispatcher
  .addMiddleware('stripe#subscription.read')
  .use('stripe#_account.read', { plan: true });

  /*
   * This will subscribe the given account to the given plan using the given
   * stripe token. Essentially, this will create a stripe customer,
   * using the given plan and subscription
   *  NOTES:
   *    - this middleware uses stripe.plan.read to read the target plan.
   *    - this middleware requires the the "account model" to be present in the intent's data "account"
   * */
  dispatcher
    .addMiddleware('stripe#subscription.create')
    .input({
      stripe_token: dispatcher.validate('STRING').error('STRIPE.TOKEN_INVALID', 'Invalid or missing stripe payment token', 400),
      stripe_coupon: dispatcher.validate('STRING').default(null),
      quantity: dispatcher.validate('NUMBER').default(1)
    })
    .use('stripe#plan.read')
    .use('stripe#_account.read', { plan: true })
    .use((intentObj, next) => {
      const calls = [],
        StripeSubscription = storeObj.model(subscriptionModel),
        StripePlan = storeObj.model(planModel);
      let stripeToken = intentObj.input('stripe_token'),
        targetQuantity = Math.max(1, intentObj.input('quantity')),
        targetCoupon = intentObj.input('stripe_coupon'),
        targetPlanObj = intentObj.data('plan'),
        currentSubscriptionObj = intentObj.data('currentSubscription'), // current account plan
        currentPlanObj = intentObj.data('currentPlan'),         // current subscription
        stripeCustomerId = null,
        isSubscriptionNew = intentObj.data('isSubscriptionNew'),
        accountObj = intentObj.data('account');
      if (!accountObj) {
        logger.error(`stripe#subscription.create: requires "account" to be present in the intent data.`);
        return next(thorin.error('STRIPE.HANDLE_ERROR', 'An error occurred while processing your request.', 400));
      }

      /* CHECK if we have to create a stripe customer. */
      calls.push(() => {
        if(accountObj.isStripeCustomer()) {
          stripeCustomerId = accountObj.getStripeCustomer();
          return;
        }
        return stripe.customers.create({
          email: accountObj.get('email'),
          description: opt.appName + ' customer'
        }).then((stripeCustomer) => {
          logger.debug(`stripe#subscription.create: customer ${stripeCustomer.id} created for account ${accountObj.id}`, {
            tags: ['stripe.customer']
          });
          // at this point, we have to update the accountObj's customer_id field.
          accountObj.set(opt.fields.customer, stripeCustomer.id);
          return accountObj.save().then(() => {
            stripeCustomerId = stripeCustomer.id;
          });
        });
      });

      /* CHECK if we can upgrade with the given data, the subscription*/
      calls.push((stop) => {
        // Plans with level 0 are considered free plans.
        if (targetPlanObj.get('level') === 0 || targetPlanObj.get('amount') === 0) {
          return stop(thorin.error('STRIPE.SUBSCRIBE_FREE_PLAN', 'The selected plan is not a payed one.', 400));
        }
        if (targetPlanObj.get('max_quantity') !== 0 && targetQuantity > targetPlanObj.get('max_quantity')) {
          return stop(thorin.error('STRIPE.SUBSCRIBE_MAX_QUANTITY', 'Your plan has exceeded its capacity and cannot be upgraded anymore.', 400));
        }
        if (currentSubscriptionObj && currentPlanObj.id === targetPlanObj.id && currentSubscriptionObj.quantity === targetQuantity) {
          return stop(thorin.error('STRIPE.SUBSCRIBE_QUANTITY', 'The subscription quantity is the same and has nothing to upgrade.', 400));
        }
        if (currentPlanObj && targetPlanObj.level < currentPlanObj.level) {
          return stop(thorin.error('STRIPE.SUBSCRIBE_UNAVAILABLE', 'You cannot upgrade to the target plan.', 400));
        }
      });

      /* CHECK if we have to CREATE a subscription. */
      calls.push((stop) => {
        if (!isSubscriptionNew || !stripeCustomerId) return;
        const data = {
          customer: stripeCustomerId,
          plan: targetPlanObj.code,
          source: stripeToken,
          quantity: targetQuantity
        }
        let trialDays = targetPlanObj.get('trial_days');
        if (!currentPlanObj && trialDays > 0) {
          let trialEndAt = Date.now() + trialDays * 60 * 60 * 24 * 1000;
          trialEndAt = Math.abs(trialEndAt / 1000);
          data.trial_end = trialEndAt;
        }
        if (targetCoupon) {
          data.coupon = targetCoupon;
        }
        return stripe.subscriptions.create(data).then((subscription) => {
          logger.info(`stripe#subscription.create: subscription: ${subscription.id} created for account: ${accountObj.id} of plan: ${targetPlanObj.code}`, {
            tags: ['stripe#subscription.create']
          });
          //create the subscription obj.
          const sObj = StripeSubscription.build({
            status: subscription.status,
            quantity: subscription.quantity,
            period_start: new Date(subscription.current_period_start * 1000),
            period_end: new Date(subscription.current_period_end * 1000),
            stripe_subscription_key: subscription.id
          });
          if (subscription.status === 'trialing' || subscription.status === 'active') {
            sObj.set('is_active', true);
          } else {
            sObj.set('is_active', false);
          }
          sObj.set(opt.models.plan + '_id', targetPlanObj.id);
          sObj.set(opt.models.account + '_id', accountObj.id);
          return sObj.save().then(() => {
            currentSubscriptionObj = sObj;
          });
        });
      });

      /* CHECK if we have to UPDATE the subscription */
      calls.push((stop) => {
        if (isSubscriptionNew || !stripeCustomerId) return;
        const data = {
          plan: targetPlanObj.code,
          source: stripeToken,
          quantity: targetQuantity
        };
        if (targetCoupon) {
          data.coupon = targetCoupon;
        }
        const currentSubscriptionKey = currentSubscriptionObj.get('stripe_subscription_key');
        return stripe.subscriptions
          .update(currentSubscriptionKey, data)
          .then((subscription) => {
            currentSubscriptionObj.set('status', subscription.status);
            currentSubscriptionObj.set('quantity', subscription.quantity);
            currentSubscriptionObj.set('period_start', new Date(subscription.current_period_start * 1000));
            currentSubscriptionObj.set('period_end', new Date(subscription.current_period_end * 1000));
            if (subscription.status === 'trialing' || subscription.status === 'active') {
              currentSubscriptionObj.set('is_active', true);
            } else {
              currentSubscriptionObj.set('is_active', false);
            }
            currentSubscriptionObj.set(opt.models.plan + '_id', targetPlanObj.id);
            return currentSubscriptionObj.save().then(() => {
              logger.info(`stripe#subscription.create: subscription ${currentSubscriptionObj.id} of account ${accountObj.id} updated to plan ${targetPlanObj.id}`, {
                tags: ['stripe#subscription.create']
              });
            });
          });
      });

      /* UPDATE the account's plan */
      calls.push(() => {
        accountObj.set(opt.models.plan + '_id', targetPlanObj.id);
        return accountObj.save().then(() => {
          logger.info(`stripe#subscription.create: account ${accountObj.id} upgraded to plan ${targetPlanObj.code} from ${currentPlanObj && currentPlanObj.code || "none"}`, {
            tags: ['stripe#upgrade']
          });
        });
      });

      thorin.series(calls, (err) => {
        if (err) {
          if(err.ns !== 'STRIPE') {
            logger.warn(`stripe#subscription.create: could not complete subcription to plan ${targetPlanObj.code} of account ${accountObj.id} with token ${stripeToken}`);
            logger.debug(err);
          }
          return next(thorin.error(err));
        }
        next();
      });
    });


  /*
   * This will perform a downgrade on the current account.
   * The downgrade will cancel the current active subscription of the account,
   * proactive (at the end of the current billing cycle.
   * NOTES:
   *   - this middleware requires the "account model" to be present in the intent.
   * */
  dispatcher
    .addMiddleware('stripe#subscription.cancel')
    .input({
      quantity: dispatcher.validate('NUMBER').default(0)
    })
    .use('stripe#_account.read', { plan: true })
    .use((intentObj, next) => {
      const calls = [],
        StripeSubscription = storeObj.model(subscriptionModel),
        StripePlan = storeObj.model(planModel);
      let accountObj = intentObj.data('account'),
        targetQuantity = intentObj.input('quantity'),
        currentSubscriptionObj = intentObj.data('currentSubscription'),
        currentPlanObj = intentObj.data('currentPlan'),
        currentSubscriptionKey = currentSubscriptionObj ? currentSubscriptionObj.get('stripe_subscription_key') : null;
      if(!accountObj) {
        logger.error(`stripe#subscription.cancel: requires "account" to be present in the intent data.`);
        return next(thorin.error('STRIPE.HANDLE_ERROR', 'An error occurred while processing your request.', 400));
      }

      /* CHECK if the current plan is a payed one and if it can be downgradable*/
      calls.push((stop) => {
        // IF the account is not a stripe customer, we cannot handle the downgrade.
        if(!accountObj.isStripeCustomer()) {
          return stop(thorin.error('STRIPE.DOWNGRADE_CUSTOMER', 'You are not a paying customer yet.', 400));
        }
        if(!currentPlanObj || currentPlanObj.get('level') === 0 || currentPlanObj.get('amount') === 0) {
          return stop(thorin.error('STRIPE.DOWNGRADE_UNAVAILABLE', 'You do not have any active plan', 400));
        }
        if(!currentSubscriptionObj || !currentSubscriptionObj.get('is_active')) {
          return stop(thorin.error('STRIPE.DOWNGRADE_INACTIVE', 'You do not have an active subscription.', 400));
        }
        if(currentSubscriptionObj.get('is_cancelled')) {
          return stop(thorin.error('STRIPE.DOWNGRADE_CANCELLED', 'You already cancelled this subscription.', 400));
        }
      });

      /* CHECK if we have a different quantity to update the subscription */
      let isSubscriptionUpdate = false;
      calls.push((stop) => {
        if(!currentSubscriptionKey) return;
        if(targetQuantity === 0 || targetQuantity >= currentSubscriptionObj.get('quantity')) return;
        isSubscriptionUpdate = true;
        const data = {
          quantity: targetQuantity
        };
        return stripe.subscriptions.update(currentSubscriptionKey, data).then((subscription) => {
          currentSubscriptionObj.set('quantity', subscription.quantity);
          return currentSubscriptionObj.save();
        });
      });

      /* CHECK if we have to initiate a cancel subscription */
      calls.push((stop) => {
        if(isSubscriptionUpdate) return;  // it was updated.
        return stripe.subscriptions.del(currentSubscriptionKey, {
          at_period_end: true
        }).then(() => {
          currentSubscriptionObj.set('is_cancelled', true);
          currentSubscriptionObj.set('cancelled_at', Date.now());
          logger.info(`stripe#subscription.cancel: account ${accountObj.id} subscription ${currentSubscriptionObj.id} will be cancelled at period end.`, {
            tags: ['stripe#subscription.cancel']
          });
          return currentSubscriptionObj.save();
        });
      });


      thorin.series(calls, (err) => {
        if(err) {
          if(err.ns !== 'STRIPE') {
            logger.warn(`stripe#subscription.cancel: could not complete downgrade from plan ${currentPlanObj.code} of account ${accountObj.id}`);
            logger.debug(err);
          }
          return next(thorin.error(err));
        }
        next();
      });
    });

}