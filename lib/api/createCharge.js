'use strict';
/**
 * Calls stripe to create a new charge and creates/saves the charge object.
 */
module.exports = (thorin, opt, stripe, pluginObj) => {
  const logger = thorin.logger(opt.logger + '.charge'),
    storeObj = thorin.store(opt.store),
    chargeModel = storeObj.camelize(opt.models.charge);

  /**
   * Attach the function to pluginObj.createCharge
   * Arguments:
   *  account - the account object to use.
   *  charge: charge information
   *    charge.amount - the amount to charge, IN CENTS (1$ = 100)
   *    charge.currency=USD - the default currency to use
   *    charge.description - the default description to use for the charge.
   *    // ANY OTHER stripe API charge arguments.
   *
   * RESOLVES WITH:
   *  chargeObj - the charge database, that contains chargeObj.info = the stripe charge information
   *
   * */
  pluginObj.createCharge = function createStripeCharge(accountObj, data) {
    if (!accountObj) return Promise.reject(thorin.error('CHARGE.CREATE', 'Missing target account', 400));
    data = thorin.util.extend({
      receipt_email: accountObj.get('email'),
      currency: 'usd'
    }, data || {});
    if (data.source !== 'string') {
      let customerKey = accountObj.get(opt.fields.customer);
      if (customerKey) {
        data.customer = customerKey;
      }
    }
    if (typeof data.amount !== 'number' || !data.amount || data.amount <= 0) return Promise.reject(thorin.error('CHARGE.CREATE', 'Charge amount must be a positive number', 400));
    return new Promise((resolve, reject) => {
      let calls = [],
        chargeObj,
        chargeInfo;
      // step one, do the charge.
      calls.push(() => {
        return stripe.charges.create(data).then((info) => {
          chargeInfo = info;
        });
      });
      // next, save the chargeObj
      calls.push(() => {
        const StripeCharge = storeObj.model(chargeModel);
        chargeObj = StripeCharge.build({
          amount: chargeInfo.amount,
          currency: chargeInfo.currency,
          status: chargeInfo.status,
          stripe_charge_key: chargeInfo.id
        })
        if(chargeInfo.status === 'succeeded') {
          chargeObj.charged_at = Date.now();
        }
        chargeObj.set(opt.models.account + '_id', accountObj.id);
        return chargeObj.save().then(() => {
          chargeObj.info = chargeInfo;
        });
      });

      thorin.series(calls, (e) => {
        if (e) return reject(e);
        if(chargeObj) {
          logger.info(`Charge ${chargeObj.id} of ${chargeObj.amount/100}${chargeObj.currency} created.`);
        }
        resolve(chargeObj);
      });
    });
  };

}