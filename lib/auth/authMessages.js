'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeAuthRequest = makeAuthRequest;
exports.encryptPrivateKey = encryptPrivateKey;
exports.decryptPrivateKey = decryptPrivateKey;
exports.makeAuthResponse = makeAuthResponse;

require('cross-fetch/polyfill');

var _jsontokens = require('jsontokens');

var _index = require('../index');

var _authConstants = require('./authConstants');

var _encryption = require('../encryption');

var _logger = require('../logger');

var VERSION = '1.3.1';

/**
 * Generates an authentication request that can be sent to the Blockstack
 * browser for the user to approve sign in. This authentication request can
 * then be used for sign in by passing it to the `redirectToSignInWithAuthRequest`
 * method.
 *
 * *Note: This method should only be used if you want to roll your own authentication
 * flow. Typically you'd use `redirectToSignIn` which takes care of this
 * under the hood.*
 *
 * @param  {String} [transitPrivateKey=generateAndStoreTransitKey()] - hex encoded transit
 *   private key
 * @param {String} redirectURI - location to redirect user to after sign in approval
 * @param {String} manifestURI - location of this app's manifest file
 * @param {Array<String>} scopes - the permissions this app is requesting
 * @param {String} appDomain - the origin of this app
 * @param {Number} expiresAt - the time at which this request is no longer valid
 * @param {Object} extraParams - Any extra parameters you'd like to pass to the authenticator.
 * Use this to pass options that aren't part of the Blockstack auth spec, but might be supported
 * by special authenticators.
 * @return {String} the authentication request
 */
function makeAuthRequest() {
  var transitPrivateKey = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : (0, _index.generateAndStoreTransitKey)();
  var redirectURI = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : window.location.origin + '/';
  var manifestURI = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : window.location.origin + '/manifest.json';
  var scopes = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : _authConstants.DEFAULT_SCOPE;
  var appDomain = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : window.location.origin;
  var expiresAt = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : (0, _index.nextHour)().getTime();
  var extraParams = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : {};

  /* Create the payload */
  var payload = Object.assign({}, extraParams, {
    jti: (0, _index.makeUUID4)(),
    iat: Math.floor(new Date().getTime() / 1000), // JWT times are in seconds
    exp: Math.floor(expiresAt / 1000), // JWT times are in seconds
    iss: null,
    public_keys: [],
    domain_name: appDomain,
    manifest_uri: manifestURI,
    redirect_uri: redirectURI,
    version: VERSION,
    do_not_include_profile: true,
    supports_hub_url: true,
    scopes: scopes
  });

  _logger.Logger.info('blockstack.js: generating v' + VERSION + ' auth request');

  /* Convert the private key to a public key to an issuer */
  var publicKey = _jsontokens.SECP256K1Client.derivePublicKey(transitPrivateKey);
  payload.public_keys = [publicKey];
  var address = (0, _index.publicKeyToAddress)(publicKey);
  payload.iss = (0, _index.makeDIDFromAddress)(address);

  /* Sign and return the token */
  var tokenSigner = new _jsontokens.TokenSigner('ES256k', transitPrivateKey);
  var token = tokenSigner.sign(payload);

  return token;
}

/**
 * Encrypts the private key for decryption by the given
 * public key.
 * @param  {String} publicKey  [description]
 * @param  {String} privateKey [description]
 * @return {String} hex encoded ciphertext
 * @private
 */
function encryptPrivateKey(publicKey, privateKey) {
  var encryptedObj = (0, _encryption.encryptECIES)(publicKey, privateKey);
  var encryptedJSON = JSON.stringify(encryptedObj);
  return new Buffer(encryptedJSON).toString('hex');
}

/**
 * Decrypts the hex encrypted private key
 * @param  {String} privateKey  the private key corresponding to the public
 * key for which the ciphertext was encrypted
 * @param  {String} hexedEncrypted the ciphertext
 * @return {String}  the decrypted private key
 * @throws {Error} if unable to decrypt
 *
 * @private
 */
function decryptPrivateKey(privateKey, hexedEncrypted) {
  var unhexedString = new Buffer(hexedEncrypted, 'hex').toString();
  var encryptedObj = JSON.parse(unhexedString);
  var decrypted = (0, _encryption.decryptECIES)(privateKey, encryptedObj);
  if (typeof decrypted !== 'string') {
    throw new Error('Unable to correctly decrypt private key');
  } else {
    return decrypted;
  }
}

/**
 * Generates a signed authentication response token for an app. This
 * token is sent back to apps which use contents to access the
 * resources and data requested by the app.
 *
 * @param  {String} privateKey the identity key of the Blockstack ID generating
 * the authentication response
 * @param  {Object} profile the profile object for the Blockstack ID
 * @param  {String} username the username of the Blockstack ID if any, otherwise `null`
 * @param  {AuthMetadata} metadata an object containing metadata sent as part of the authentication
 * response including `email` if requested and available and a URL to the profile
 * @param  {String} coreToken core session token when responding to a legacy auth request
 * or `null` for current direct to gaia authentication requests
 * @param  {String} appPrivateKey the application private key. This private key is
 * unique and specific for every Blockstack ID and application combination.
 * @param  {Number} expiresAt an integer in the same format as
 * `new Date().getTime()`, milliseconds since the Unix epoch
 * @param {String} transitPublicKey the public key provide by the app
 * in its authentication request with which secrets will be encrypted
 * @param {String} hubUrl URL to the write path of the user's Gaia hub
 * @param {String} blockstackAPIUrl URL to the API endpoint to use
 * @param {String} associationToken JWT that binds the app key to the identity key
 * @return {String} signed and encoded authentication response token
 * @private
 */
function makeAuthResponse(privateKey) {
  var profile = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var username = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
  var metadata = arguments[3];
  var coreToken = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;
  var appPrivateKey = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : null;
  var expiresAt = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : (0, _index.nextMonth)().getTime();
  var transitPublicKey = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : null;
  var hubUrl = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : null;
  var blockstackAPIUrl = arguments.length > 9 && arguments[9] !== undefined ? arguments[9] : null;
  var associationToken = arguments.length > 10 && arguments[10] !== undefined ? arguments[10] : null;

  /* Convert the private key to a public key to an issuer */
  var publicKey = _jsontokens.SECP256K1Client.derivePublicKey(privateKey);
  var address = (0, _index.publicKeyToAddress)(publicKey);

  /* See if we should encrypt with the transit key */
  var privateKeyPayload = appPrivateKey;
  var coreTokenPayload = coreToken;
  var additionalProperties = {};
  if (appPrivateKey !== undefined && appPrivateKey !== null) {
    _logger.Logger.info('blockstack.js: generating v' + VERSION + ' auth response');
    if (transitPublicKey !== undefined && transitPublicKey !== null) {
      privateKeyPayload = encryptPrivateKey(transitPublicKey, appPrivateKey);
      if (coreToken !== undefined && coreToken !== null) {
        coreTokenPayload = encryptPrivateKey(transitPublicKey, coreToken);
      }
    }
    additionalProperties = {
      email: metadata.email ? metadata.email : null,
      profile_url: metadata.profileUrl ? metadata.profileUrl : null,
      hubUrl: hubUrl,
      blockstackAPIUrl: blockstackAPIUrl,
      associationToken: associationToken,
      version: VERSION
    };
  } else {
    _logger.Logger.info('blockstack.js: generating legacy auth response');
  }

  /* Create the payload */
  var payload = Object.assign({}, {
    jti: (0, _index.makeUUID4)(),
    iat: Math.floor(new Date().getTime() / 1000), // JWT times are in seconds
    exp: Math.floor(expiresAt / 1000), // JWT times are in seconds
    iss: (0, _index.makeDIDFromAddress)(address),
    private_key: privateKeyPayload,
    public_keys: [publicKey],
    profile: profile,
    username: username,
    core_token: coreTokenPayload
  }, additionalProperties);

  /* Sign and return the token */
  var tokenSigner = new _jsontokens.TokenSigner('ES256k', privateKey);
  return tokenSigner.sign(payload);
}