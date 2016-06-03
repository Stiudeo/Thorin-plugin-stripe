'use strict';
/*
 * Registers the stripe charge middleware.
 * */
module.exports = function(thorin, opt, stripe) {
  const logger = thorin.logger(opt.logger),
    storeObj = thorin.store(opt.store),
    dispatcher = thorin.dispatcher,
    chargeModel = storeObj.camelize(opt.models.charge);

  /*
   * This will read the stripe charge information, based on a stripe_charge entity.
   * NOTE:
   *  - when we read the charge, we use intentObj.data('stripeQuery'), by default we just query by id.
   * This will attach to the intent's data:
   *  - charge: the database chargeObj entry
   *  - stripeCharge: the stripe charge entry associated with the charge.
   * */
  dispatcher
    .addMiddleware('stripe.charge.read')
    .input({
      charge_id: dispatcher.validate('NUMBER').default(null)
    })
    .use((intentObj, next) => {
      const StripeCharge = storeObj.model(chargeModel);
      let calls = [],
        chargeObj = null,
        chargeInfo = null,
        stripeCharge = null;

      /* Check if we already have a charge in the intent */
      calls.push((stop) => {
        if (intentObj.data('charge')) {
          chargeObj = intentObj.data('charge');
          return;
        }
        if (!intentObj.input('charge_id')) {
          return stop(thorin.error('CHARGE.MISSING_ID', 'Please select a charge', 400));
        }
        const qry = thorin.util.extend(intentObj.data('stripeQuery') || {}, {
          id: intentObj.input('charge_id')
        });
        return StripeCharge.find(qry).then((cObj) => {
          if (!cObj) {
            return stop(thorin.error('CHARGE.NOT_FOUND', 'The requested charge was not found.', 404));
          }
          chargeObj = cObj;
        });
      });

      /* Read the charge from stripe */
      calls.push((stop) => {
        if (!chargeObj.get('stripe_charge_key')) return stop(thorin.error('CHARGE.NOT_FOUND', 'The requested charge does not exist in Stripe.', 404));
        return stripe.charges.retrieve(chargeObj.get('stripe_charge_key')).then((chargeData) => {
          chargeInfo = chargeData;
        });
      });

      thorin.series(calls, (err) => {
        if (err) {
          return next(thorin.error(err));
        }
        intentObj.data('charge', chargeObj);
        intentObj.data('stripeCharge', chargeInfo);
        next();
      });
    });

  /*
   * This will read all the charges of the given account.
   * The middleware will place in the intent's DATA:
   *  - stripeCharges[] -> array of stripe charges for the client.
   *  OPTIONS:
   *    - sync =boolean -> if set, we will sync the items in the db as well.
   * NOTE:
   *   - this requires an "account object/id" to be placed in intentObj.data('account')
   *   - this will read the charges directly from stripe, not the ones in the db.
   *   - However, we can optionally sync them with those from the db.
   * */
  dispatcher
    .addMiddleware('stripe.charge.find')
    .input({
      start_date: dispatcher.validate('DATE').default(null),
      end_date: dispatcher.validate('DATE').default(null),
      limit: dispatcher.validate('NUMBER').default(50),
      next_charge: dispatcher.validate('STRING').default(null)  // used for pagination
    })
    .use('stripe._account.read')
    .use((intentObj, next, mOpt) => {
      let accountObj = intentObj.data('account'),
        charges = [],
        calls = [];
      /* IF the account is not a stripe customer, we stop */
      if (!accountObj.isStripeCustomer()) {
        intentObj.data('stripeCharges', charges);
        return next();
      }

      /* FIND all items from stripe */
      calls.push(() => {
        const query = {
          customer: accountObj.getStripeCustomer(),
          limit: intentObj.input('limit')
        };
        let startDt = intentObj.input('start_date'),
          endDt = intentObj.input('end_date');
        if (startDt || endDt) {
          query.created = {};
          if (startDt) {
            query.created.gte = Math.abs(startDt.getTime() / 1000);
          }
          if (endDt) {
            query.created.lte = Math.abs(endDt.getTime() / 1000);
          }
        }
        if (intentObj.input('next_charge')) {
          query.starting_after = intentObj.input('next_charge');
        }
        return stripe.charges.list(query).then((res) => {
          charges = res.data;
        });
      });

      /* CHECK if we have to sync with the ones in the db. */
      if (mOpt.sync) {
        const StripeCharge = storeObj.model(chargeModel);
        let dbItems = [];
        // read all local items
        calls.push(() => {
          if (charges.length === 0) return;
          const qry = {};
          qry[opt.models.account + '_id'] = accountObj.id;

          return StripeCharge.findAll({
            where: qry
          }).then((items) => {
            dbItems = items;
          });
        });

        // check if we have to update / insert new items
        calls.push(() => {
          let toSave = [],
            dbMap = {};
          for (let i = 0; i < dbItems.length; i++) {
            dbMap[dbItems[i].get('stripe_charge_key')] = dbItems[i];
          }
          dbItems = [];
          for (let i = 0; i < charges.length; i++) {
            let charge = charges[i],
              isNew = false,
              chargeObj = dbMap[charge.id] || null;
            if (!chargeObj) {
              isNew = true;
              chargeObj = StripeCharge.build({
                amount: charge.amount,
                currency: charge.currency,
                stripe_charge_key: charge.id
              });
              chargeObj.set(opt.models.account + '_id', accountObj.id);
            }
            chargeObj.set('status', charge.status);
            if (charge.invoice) {
              chargeObj.set('stripe_invoice_key', charge.invoice);
            }
            if (charge.amount_refunded) {
              chargeObj.set('amount_refunded', charge.amount_refunded)
            }
            if (charge.status === 'refunded' && isNew) {
              try {
                let lastRefund = charge.refunds.data[charge.refunds.data.length - 1].created;
                chargeObj.set('refunded_at', new Date(lastRefund * 1000));
              } catch (e) {
              }
            }
            toSave.push(() => {
              return chargeObj.save();
            });
          }
          thorin.series(toSave, (err) => {
            if(err) {
              logger.warn(`stripe.charge.find: could not sync charges for account ${accountObj.id}`);
              logger.debug(err);
            }
          });
        });
      }

      thorin.series(calls, (err) => {
        if (err) {
          if (err.ns !== 'STRIPE') {
            logger.warn(`stripe.charge.find: could not find stripe charges for account  ${accountObj.id}`);
            logger.debug(err);
          }
          return next(thorin.error(err));
        }
        intentObj.data('stripeCharges', charges);
        next();
      });
    });


}