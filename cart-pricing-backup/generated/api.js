// @ts-check
// Generated types for Cart Transform Function
// Based on run.graphql input query

/**
 * @typedef {Object} Attribute
 * @property {string} [value]
 */

/**
 * @typedef {Object} Money
 * @property {string} currencyCode
 */

/**
 * @typedef {Object} CartLineCost
 * @property {Money} [amountPerQuantity]
 */

/**
 * @typedef {Object} ProductVariant
 * @property {"ProductVariant"} __typename
 * @property {string} id
 */

/**
 * @typedef {Object} CartLine
 * @property {string} id
 * @property {number} quantity
 * @property {CartLineCost} [cost]
 * @property {ProductVariant} [merchandise]
 * @property {Attribute} [areaX]
 * @property {Attribute} [areaY]
 * @property {Attribute} [preCut]
 * @property {Attribute} [customImage]
 */

/**
 * @typedef {Object} BuyerIdentity
 * @property {string} [countryCode]
 */

/**
 * @typedef {Object} Cart
 * @property {BuyerIdentity} [buyerIdentity]
 * @property {CartLine[]} lines
 */

/**
 * @typedef {Object} RunInput
 * @property {Cart} cart
 */

/**
 * @typedef {Object} FixedPricePerUnit
 * @property {string} amount
 * @property {string} currencyCode
 */

/**
 * @typedef {Object} PriceAdjustment
 * @property {FixedPricePerUnit} fixedPricePerUnit
 */

/**
 * @typedef {Object} Price
 * @property {PriceAdjustment} adjustment
 */

/**
 * @typedef {Object} CartLineUpdate
 * @property {string} cartLineId
 * @property {Price} price
 */

/**
 * @typedef {Object} CartOperation
 * @property {CartLineUpdate} [update]
 */

/**
 * @typedef {Object} FunctionRunResult
 * @property {CartOperation[]} operations
 */

export {};
