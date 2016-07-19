'use strict';
/*
 * Utility middleware that are used internally by the stripe middlewares.
 * */
module.exports = function(thorin, opt) {
  const logger = thorin.logger(opt.logger),
    storeObj = thorin.store(opt.store),
    dispatcher = thorin.dispatcher,
    subscriptionModel = storeObj.camelize(opt.models.subscription),
    planModel = storeObj.camelize(opt.models.plan),
    accountModel = storeObj.camelize(opt.models.account);

  /*
   * Internal module used to read the account from the database, as well as
   * its active subscription/plan if available.
   * This works with the "account" intent data (either the account object, or account id)
   * */
  dispatcher
    .addMiddleware('stripe#_account.read')
    .use((intentObj, next, readOpt) => {
      let accountObj =  intentObj.data('account');
      if (!accountObj) {
        logger.error(`stripe#_account.read: requires "account" to be present in the intent data.`);
        return next(thorin.error('STRIPE.HANDLE_ERROR', 'An error occurred while processing your request.', 400));
      }
      const Account = storeObj.model(accountModel);
      let accountId;
      if (typeof accountObj === 'number') {
        accountId = accountObj;
      } else if (typeof accountObj === 'string' && accountObj !== '') {
        accountId = parseInt(accountObj, 10);
        if (isNaN(accountId)) {
          accountId = null;
        }
      } else if (typeof accountObj === 'object' && accountObj && accountObj.id) {
        accountId = accountObj.id;
      }
      if (!accountId) {
        logger.error(`stripe#_account.read: requires intent "account" data to be a number or the account object. Received: ${accountId}`);
        return next(thorin.error('STRIPE.HANDLE_ERROR', 'An error occurred while processing your request.', 400));
      }
      return Account.find({
        where: {
          id: accountId
        }
      }).then((aObj) => {
        if (!aObj) {
          logger.error(`stripe#_account.read: account ${accountId} does not exist in the database`);
          return next(thorin.error('STRIPE.ACCOUNT_INACTIVE', 'Your account is not active', 400));
        }
        intentObj.data('account', aObj);
        if(!readOpt.plan) {
          return next();
        }
        if(opt.singleSubscription === false) {
          intentObj.data('isSubscriptionNew', true);
          return next();
        }
        return aObj.getSubscription({plan: true}).then((subObj) => {
          if (!subObj) {
            intentObj.data('isSubscriptionNew', true);
            return next();
          }
          intentObj.data('isSubscriptionNew', false);
          intentObj.data('currentSubscription', subObj);
          intentObj.data('currentPlan', subObj.get(storeObj.camelize(opt.models.plan)));
          next();
        }).catch(next);
      }).catch(next);
    });
}
