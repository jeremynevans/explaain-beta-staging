// connection.js
var exports = module.exports = {};


//Initial connection

var Q = require('q');
var Firebase = require('firebase');
var algoliasearch = require('algoliasearch');

var usingTeams, fb, fbTeams, fbMain, fbCards, fbUsers, client, index, algoliaSearchAPIKey;


exports.connectToServices = function(usingTeamsTemp) {
    var deferred = Q.defer();
    console.log('making connections');
    
    usingTeams = usingTeamsTemp;

    var firebaseInstance = usingTeams ? process.env.FIREBASE_INSTANCE_CLOSED : process.env.FIREBASE_INSTANCE_OPEN;
    fb = fbMain = new Firebase('https://' + firebaseInstance + '.firebaseio.com/');
    fbUsers = fb.child("users");
    client = algoliasearch('RR6V7DE8C8', 'b96680f1343093d8822d98eb58ef0d6b');
    
    deferred.resolve();
    return deferred.promise;
}

exports.connectToRecords = function(team) {
    var deferred = Q.defer();
    if (usingTeams) {
        fbTeams = fb.child("teams");
        fbMain = fbTeams.child(team);
    }
    fbCards = fbMain.child('cards');
    
    var algoliaIndex = usingTeams ? process.env.ALGOLIA_INDEX + '-' + team : process.env.ALGOLIA_INDEX;
    index = client.initIndex(algoliaIndex);
    
    getAlgoliaAPIKey(team)
    .then(function(key) {
        algoliaSearchAPIKey = key;
        
        // Listen for changes to Firebase data
        fbCards.limitToLast(1).on('child_added', addOrUpdateObjectToAlgolia);
        fbCards.limitToLast(1).on('child_changed', addOrUpdateObjectToAlgolia);
        fbCards.limitToLast(1).on('child_removed', removeIndex);
        
        deferred.resolve({
            algoliaSearchAPIKey: algoliaSearchAPIKey
        });
    });
    
    return deferred.promise;    
}

function getAlgoliaAPIKey(team) {
    var deferred = Q.defer();
    var key;
    if (usingTeams) {
        fbMain.child('settings').on('value', function(dataSnapshot) {
            key = dataSnapshot.val().apiSearch;
            if (!key) {
                key = createNewAlgoliaAPIKey(team)
                .then(function() {
                    deferred.resolve(key);
                });
            }
        })
    } else {
        key = process.env.ALGOLIA_SEARCH_API_KEY;
        deferred.resolve(key);
    }
    return deferred.promise;
}


function createNewAlgoliaAPIKey(team) {
    var deferred = Q.defer();
    // Creates a new API key that is valid for the team index only
    client.addUserKey(['search'], {
        indexes: [process.env.ALGOLIA_INDEX + '-' + team]
    }, function(err, content) {
        var key = content['key'];
        console.log('Key:' + key);
        fbMain.child('settings').update({apiSearch: key});
        deferred.resolve(key);
    });
    return deferred.promise;
}


function addOrUpdateObjectToAlgolia(dataSnapshot) {
  // Get Firebase object
  var firebaseObject = dataSnapshot.val();

  // Specify Algolia's objectID using the Firebase object key
  firebaseObject.objectID = dataSnapshot.key();

  // Add or update object
  index.saveObject(firebaseObject, function(err, content) {
    if (err) {
      throw err;
    }

    console.log('Firebase<>Algolia object saved');
  });
}


function removeIndex(dataSnapshot) {
  // Get Algolia's objectID from the Firebase object key
  var objectID = dataSnapshot.key();

  // Remove the object from Algolia
  index.deleteObject(objectID, function(err, content) {
    if (err) {
      throw err;
    }

    console.log('Firebase<>Algolia object deleted');
  });
}

