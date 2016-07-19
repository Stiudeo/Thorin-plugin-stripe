'use strict';
/**
 * Creates a stripe customer and attaches him to the given account object.
 * */
module.exports = function(thorin, opt, stripe) {
  const logger = thorin.logger(opt.logger),
    storeObj = thorin.store(opt.store),
    dispatcher = thorin.dispatcher;

  /*
   * This will create a stripe customer and attach it to the intent's account object.
   * This will not attach anything to the intent data, however it will update the account model.
   * OPTIONS:
   *  force=false -> force the re-creation of the customer.
   *                NOTE: it will not delete the old customer.
   *  token=false -> if set to true, it will force the stripe token.
   * */
  dispatcher
    .addMiddleware('stripe#customer.create')
    .input({
      email: dispatcher.validate('EMAIL').default(null),
      stripe_token: dispatcher.validate('STRING').default(null), // optional stripe token.
      stripe_coupon: dispatcher.validate('STRING').default(null)  // optional stripe coupon
    })
    .use((intentObj, next, mOpt) => {
      let accountObj = intentObj.data('account');
      if (!accountObj) {
        logger.warn(`stripe#customer.create: requires "account" to be present in intent.`);
        return next(thorin.error('STRIPE.HANDLE_ERROR', 'An error occurred while processing your request.'));
      }
      let isCustomer = accountObj.isStripeCustomer(),
        stripeCustomer,
        stripeCoupon = intentObj.input('stripe_coupon');
      if (mOpt.force !== true && isCustomer) return next();
      let email = accountObj.get('email') || intentObj.input('email') || null;
      if (!email) {
        logger.warn(`stripe#customer.create: account model does not have an e-mail attached.`);
        return next(thorin.error('STRIPE.HANDLE_ERROR', 'An error occurred while processing your request.'));
      }
      let data = {
        email,
        description: opt.appName + ' customer',
        metadata: {
          account_id: accountObj.id
        }
      };
      let sToken = intentObj.input('stripe_token');
      if(mOpt.token === true && !sToken) {
        return next(thorin.error('STRIPE.TOKEN', 'A valid stripe token is required.'));
      }
      if (sToken) {
        data.source = sToken;
      }
      if(stripeCoupon) {
        data.coupon = stripeCoupon;
      }
      let calls = [];

      calls.push(() => {
        return stripe.customers.create(data).then((customer) => {
          stripeCustomer = customer;
          logger.debug(`stripe#subscription.create: customer ${stripeCustomer.id} created for account ${accountObj.id}`, {
            tags: ['stripe.customer']
          });
        });
      });

      // update the account.
      calls.push(() => {
        // at this point, we have to update the accountObj's customer_id field.
        accountObj.set(opt.fields.customer, stripeCustomer.id);
        return accountObj.save();
      });

      thorin.series(calls, (e) => {
        if(e) {
          logger.warn(`stripe#customer.create: could not create stripe customer`, e);
          return next(thorin.error(e));
        }
        next();
      });
    });

}