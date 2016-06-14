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
      .field('currency', Seq.STRING(6))
      .field('status', Seq.STRING(50), {
        defaultValue: 'pending'
      })
      .field('stripe_charge_key', Seq.STRING(100))
      .field('stripe_invoice_key', Seq.STRING(100), {
        defaultValue: null,
        allowNull: true
      })
      .field('amount_refunded', Seq.INTEGER, {
        defaultValue: null
      })
      .field('charged_at', Seq.DATE, {
        defaultValue: null,
        allowNull: true
      })
      .field('refunded_at', Seq.DATE, {
        defaultValue: null,
        allowNull: true
      })
      .field('failed_at', Seq.DATE, {
        defaultValue: null,
        allowNull: true
      });

    modelObj
      .method(function getInvoice() {
        let id = this.id,
          len = opt.invoice.length,
          prefix = opt.invoice.prefix;
        let res = prefix,
          diff = len - id.toString().length;
        for(let i=0; i < diff; i++) {
          res += '0';
        }
        res += id;
        return res;
      });

    modelObj
      .index('stripe_charge_key')
      .belongsTo(storeObj.camelize(opt.models.subscription), {
        onDelete: "SET NULL",
        create: false,
        update: false
      })
      .belongsTo(storeObj.camelize(opt.models.account), {
        as: storeObj.camelize(opt.models.account),
        onDelete: "SET NULL",
        create: false,
        update: false
      });


  };
};