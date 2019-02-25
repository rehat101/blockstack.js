'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BLOCKSTACK_GAIA_HUB_LABEL = undefined;
exports.uploadToGaiaHub = uploadToGaiaHub;
exports.getFullReadUrl = getFullReadUrl;
exports.connectToGaiaHub = connectToGaiaHub;
exports.setLocalGaiaHubConnection = setLocalGaiaHubConnection;
exports.getOrSetLocalGaiaHubConnection = getOrSetLocalGaiaHubConnection;
exports.getBucketUrl = getBucketUrl;

var _bitcoinjsLib = require('bitcoinjs-lib');

var _bitcoinjsLib2 = _interopRequireDefault(_bitcoinjsLib);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _jsontokens = require('jsontokens');

var _authApp = require('../auth/authApp');

var _utils = require('../utils');

var _index = require('../index');

var _authConstants = require('../auth/authConstants');

var _logger = require('../logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var BLOCKSTACK_GAIA_HUB_LABEL = exports.BLOCKSTACK_GAIA_HUB_LABEL = 'blockstack-gaia-hub-config';

function uploadToGaiaHub(filename, contents, hubConfig) {
  var contentType = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'application/octet-stream';

  _logger.Logger.debug('uploadToGaiaHub: uploading ' + filename + ' to ' + hubConfig.server);
  return fetch(hubConfig.server + '/store/' + hubConfig.address + '/' + filename, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Authorization: 'bearer ' + hubConfig.token
    },
    body: contents
  }).then(function (response) {
    if (response.ok) {
      return response.text();
    } else {
      throw new Error('Error when uploading to Gaia hub');
    }
  }).then(function (responseText) {
    return JSON.parse(responseText);
  }).then(function (responseJSON) {
    return responseJSON.publicURL;
  });
}

function getFullReadUrl(filename, hubConfig) {
  return '' + hubConfig.url_prefix + hubConfig.address + '/' + filename;
}

function makeLegacyAuthToken(challengeText, signerKeyHex) {
  // only sign specific legacy auth challenges.
  var parsedChallenge = void 0;
  try {
    parsedChallenge = JSON.parse(challengeText);
  } catch (err) {
    throw new Error('Failed in parsing legacy challenge text from the gaia hub.');
  }
  if (parsedChallenge[0] === 'gaiahub' && parsedChallenge[3] === 'blockstack_storage_please_sign') {
    var signer = (0, _index.hexStringToECPair)(signerKeyHex + (signerKeyHex.length === 64 ? '01' : ''));
    var digest = _bitcoinjsLib2.default.crypto.sha256(challengeText);
    var signature = signer.sign(digest).toDER().toString('hex');
    var publickey = (0, _index.getPublicKeyFromPrivate)(signerKeyHex);
    var _token = Buffer.from(JSON.stringify({ publickey: publickey, signature: signature })).toString('base64');
    return _token;
  } else {
    throw new Error('Failed to connect to legacy gaia hub. If you operate this hub, please update.');
  }
}

function makeV1GaiaAuthToken(hubInfo, signerKeyHex, hubUrl, associationToken) {
  var challengeText = hubInfo.challenge_text;
  var handlesV1Auth = hubInfo.latest_auth_version && parseInt(hubInfo.latest_auth_version.slice(1), 10) >= 1;
  var iss = (0, _index.getPublicKeyFromPrivate)(signerKeyHex);

  if (!handlesV1Auth) {
    return makeLegacyAuthToken(challengeText, signerKeyHex);
  }

  var salt = _crypto2.default.randomBytes(16).toString('hex');
  var payload = {
    gaiaChallenge: challengeText,
    hubUrl: hubUrl,
    iss: iss,
    salt: salt,
    associationToken: associationToken
  };
  var token = new _jsontokens.TokenSigner('ES256K', signerKeyHex).sign(payload);
  return 'v1:' + token;
}

function connectToGaiaHub(gaiaHubUrl, challengeSignerHex, associationToken) {
  if (!associationToken) {
    // maybe given in local storage?
    try {
      var userData = (0, _authApp.loadUserData)();
      if (userData && userData.gaiaAssociationToken) {
        associationToken = userData.gaiaAssociationToken;
      }
    } catch (e) {
      associationToken = undefined;
    }
  }

  _logger.Logger.debug('connectToGaiaHub: ' + gaiaHubUrl + '/hub_info');

  return fetch(gaiaHubUrl + '/hub_info').then(function (response) {
    return response.json();
  }).then(function (hubInfo) {
    var readURL = hubInfo.read_url_prefix;
    var token = makeV1GaiaAuthToken(hubInfo, challengeSignerHex, gaiaHubUrl, associationToken);
    var address = (0, _utils.ecPairToAddress)((0, _index.hexStringToECPair)(challengeSignerHex + (challengeSignerHex.length === 64 ? '01' : '')));
    return {
      url_prefix: readURL,
      address: address,
      token: token,
      server: gaiaHubUrl
    };
  });
}

/**
 * These two functions are app-specific connections to gaia hub,
 *   they read the user data object for information on setting up
 *   a hub connection, and store the hub config to localstorage
 * @private
 * @returns {Promise} that resolves to the new gaia hub connection
 */
function setLocalGaiaHubConnection() {
  var userData = (0, _authApp.loadUserData)();

  if (!userData.hubUrl) {
    userData.hubUrl = _authConstants.BLOCKSTACK_DEFAULT_GAIA_HUB_URL;

    window.localStorage.setItem(_authConstants.BLOCKSTACK_STORAGE_LABEL, JSON.stringify(userData));

    userData = (0, _authApp.loadUserData)();
  }

  return connectToGaiaHub(userData.hubUrl, userData.appPrivateKey, userData.associationToken).then(function (gaiaConfig) {
    localStorage.setItem(BLOCKSTACK_GAIA_HUB_LABEL, JSON.stringify(gaiaConfig));
    return gaiaConfig;
  });
}

function getOrSetLocalGaiaHubConnection() {
  var hubConfig = localStorage.getItem(BLOCKSTACK_GAIA_HUB_LABEL);
  if (hubConfig) {
    var hubJSON = JSON.parse(hubConfig);
    if (hubJSON !== null) {
      return Promise.resolve(hubJSON);
    }
  }
  return setLocalGaiaHubConnection();
}

function getBucketUrl(gaiaHubUrl, appPrivateKey) {
  var challengeSigner = void 0;
  try {
    challengeSigner = _bitcoinjsLib2.default.ECPair.fromPrivateKey(new Buffer(appPrivateKey, 'hex'));
  } catch (e) {
    return Promise.reject(e);
  }

  return fetch(gaiaHubUrl + '/hub_info').then(function (response) {
    return response.text();
  }).then(function (responseText) {
    return JSON.parse(responseText);
  }).then(function (responseJSON) {
    var readURL = responseJSON.read_url_prefix;
    var address = (0, _utils.ecPairToAddress)(challengeSigner);
    var bucketUrl = '' + readURL + address + '/';
    return bucketUrl;
  });
}