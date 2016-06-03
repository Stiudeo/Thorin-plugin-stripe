'use strict';
/*
 * This will process any charges that may come through the event webhook.
 * Note: this only works with the subscription model.
 * */
module.exports = function init(thorin, opt, stripe) {
  const hooker = require('../eventHook')(),
    logger = thorin.logger(opt.logger + ".process"),
    storeObj = thorin.store(opt.store),
    Account = storeObj.model(storeObj.camelize(opt.models.account)),
    StripeCharge = storeObj.model(storeObj.camelize(opt.models.charge)),
    StripeSubscription = storeObj.model(storeObj.camelize(opt.models.subscription));

  /*
   * When a chareg is created, we will store it to the db.
   * */
  hooker.addHook(
    'charge.succeeded',
    'charge.captured',
    'charge.failed',
    'charge.refunded',
    (charge, next, eventName) => {
      let calls = [],
        isNew = true,
        subscriptionKey,
        chargeObj,
        subscriptionObj,
        accountObj;

      // first, read the customer account
      calls.push((stop) => {
        if (!charge.customer) return stop();
        const qry = {};
        qry[opt.fields.customer] = charge.customer;
        return Account.find({
          where: qry
        }).then((aObj) => {
          if (!aObj) return stop(); // not a customer
          accountObj = aObj;
        });
      });

      // next, create the charge if it does not exist.
      calls.push((stop) => {
        const qry = {
          stripe_charge_key: charge.id,
        };
        qry[opt.models.account + "_id"] = accountObj.id;
        return StripeCharge.find({
          where: qry
        }).then((cObj) => {
          if (!cObj) return;
          isNew = false;
          chargeObj = cObj;
        });
      });

      // Check if we have to CREATE a charge.
      calls.push(() => {
        if (!isNew) return;  // already created, we will update it.
        chargeObj = StripeCharge.build({
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
          stripe_charge_key: charge.id
        });
        chargeObj.set(opt.models.account + '_id', accountObj.id);
      });

      // read the invoice and extract the subscription key
      calls.push(() => {
        if(!charge.invoice || chargeObj.get(opt.models.subscription + '_id')) return;  // charge already assigned to the subscription.
        return stripe.invoices.retrieve(charge.invoice).then((invoice) => {
          if(invoice.subscription) {
            subscriptionKey = invoice.subscription;
          }
        });
      });

      // check if we have to read a subscription based on the subscription key.
      calls.push(() => {
        if(!subscriptionKey) return;
        const qry = {
          stripe_subscription_key: subscriptionKey,
        };
        qry[opt.models.account + "_id"] = accountObj.id
        return StripeSubscription.find({
          where: qry
        }).then((sObj) => {
          if(!sObj) return;
          subscriptionObj = sObj;
          chargeObj.set(opt.models.subscription + "_id", sObj.id);
        });
      });

      // We will actually store the charge now.
      calls.push(() => {
        chargeObj.set('status', charge.status);
        if (charge.invoice) {
          chargeObj.set('stripe_invoice_key', charge.invoice);
        }
        switch (eventName) {
          case 'charge.refunded':
            chargeObj.set('status', 'refunded');
            chargeObj.set('refunded_at', new Date());
            chargeObj.set('amount_refunded', charge.amount_refunded);
            break;
          case 'charge.succeeded':
          case 'charge.captured':
            if (charge.paid) {
              chargeObj.set('charged_at', new Date());
            }
            break;
          case 'charge.failed':
            chargeObj.set('failed_at', new Date());
            break;
        }
        return chargeObj.save();
      });

      // check if we should update the charged_at field in the subscription
      calls.push(() => {
        if(!subscriptionObj) return;
        subscriptionObj.set('charged_at', new Date());
        return subscriptionObj.save();
      });

      thorin.series(calls, (e) => {
        if (e) return next(e);
        if(chargeObj) {
          logger.trace(`stripe.process.charge: charge ${chargeObj.id} processed with status: ${chargeObj.status} [${eventName}]`, {
            tags: ['stripe.process.charge']
          });
        }
        next();
      });
    });
}