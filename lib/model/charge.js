'use strict';
/**
 * The stripe charge contains information about any charge that happened in stripe.
 *
 */
module.exports = function(thorin, opt, storeObj) {

  return function initModel(modelObj, Seq) {
    modelObj.options.updatedAt = true;

    modelObj
      .field('id', Seq.PRIMARY)
      .field('amount', Seq.INTEGER)
      .field('status', Seq.ENUM('PENDING', 'SUCCESS', 'FAILED'))
      .field('type', Seq.ENUM('FUND', 'REFUND'))
      .field('charge_at', Seq.DATE, {
        defaultValue: null,
        allowNull: true
      })
      .field('stripe_charge_key', Seq.STRING(100));

    modelObj
      .index('stripe_charge_key')
      .belongsTo(storeObj.camelize(opt.subscriptionModel), {
        create: false,
        update: false
      })
      .belongsTo(storeObj.camelize(opt.accountModel), {
        as: storeObj.camelize(opt.accountModel),
        create: false,
        update: false
      });


  };
};