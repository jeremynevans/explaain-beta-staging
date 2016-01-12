function clog(myText) {
    console.log(myText);
};

function clogyo() {
    console.log('yo');
};

var currentTimestamp = Date.now();

$(function () {
  $('[data-toggle="tooltip"]').tooltip()
})

var firstCard = true;

var ctrlKeyDown = false;
var cardToOpen = ''; //This is not a good way of doing it


var myScope;
var mainScope;

var app = angular.module('app', ['firebase', 'ngMaterial', 'algoliasearch', 'ngRoute', 'ngSanitize', 'ngResource', 'monospaced.elastic', 'contenteditable']); /* global angular */

app.controller('MainCtrl', ['$scope', '$timeout', '$http', '$mdToast', '$mdSidenav', 'algolia', '$q', 'Cards', 'Post', function($scope, $timeout, $http, $mdToast, $mdSidenav, algolia, $q, Cards, Post) {

    Cards.checkServiceWorks();
    mainScope = $scope;

    Cards.bootUp();

    $scope.cards = Cards.cards;
    $scope.hits = Cards.hits;
    $scope.CardsRef = Cards;


    // Post.query(function(data) {
    //     $scope.posts = data;
    //      console.log(data);
    // });

    // function myFunction() {

    //     $http.jsonp('http://demo.ckan.org/api/3/action/package_search?callback=myFunction1'); /* global $http */

    // }
    // myFunction();

    // function myFunction1(data) {
    //      console.log('data2', data);
    // }

    //Should these be in a service?

    window.onkeydown = function(event) {
        ctrlKeyDown = event.ctrlKey;
    };

    window.onkeyup = function(event) {
        ctrlKeyDown = event.ctrlKey;
    };

    document.onkeyup = function(event) {
        if (event.keyCode == 67 && !ctrlKeyDown) {
            // $scope.createCardFromSelection(event, -1);
        }
        else if (event.keyCode == 87) {
            // $scope.createCardFromSelection(event, 'wikipedia');
        }
    };

}]);







app.service('Cards', ['$rootScope', '$q', '$http', function($rootScope, $q, $http) {
    var service = {

        godMode: false,
        loggedIn: false,
        loginData: {},
        editMode: true,
        thisTeam: null,

        usingTeams: false,

        firebaseRef: null,
        firebaseTeams: null,
        firebaseMain: null,
        firebaseCards: null,
        firebaseIdentities: null,
        firebaseKeywords: null,
        firebaseUsers: null,

        algoliaSearchAPIKey: null,
        clientAlgolia: null,
        algoliaIndex: null,

        cards: [],
        identities: [],
        keywords: [],
        users: [],

        orderedKeywords: [],

        formatOptions: function() {
            return [
                'profile',
                'list',
                'quote',
                'embed',
                'image'
            ]
        },


        checkServiceWorks: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: checkServiceWorks');
        },
        
        bootUp: function() {
            service.serverConnectToServices()
            .then(function(fbInstance) {
                service.fbInstance = fbInstance;
                $('#myModal').modal();
            });
        },
        
        bootUpServices: function(usingTeams) {
            /*LOG*/ //console.log('bootUpServices');
            service.usingTeams = usingTeams;
            service.connectToFirebase(service.fbInstance)
            if (usingTeams) {
                service.logMeIn('twitter')
                .then(service.getThisUserTeam)
                .then(function(team) {
                    if (!team) {
                        $('#createTeamModal').modal();
                    } else {
                        service.thisTeam = team;
                        service.bootUpRecords();
                    }
                });
            } else {
                service.bootUpRecords();
            }
        },
        
        bootUpNewTeam: function(teamTitle) {
            var newTeam = service.firebaseTeams.push();
            var teamKey = newTeam.key();
            newTeam.set({
                settings: {
                    title: teamTitle
                }
            }, function(error) {
                service.thisTeam = teamKey;
                service.firebaseUsers.child(service.loginData.uid).update({
                    teams: [
                        service.thisTeam
                        ]
                }, function() {
                    service.importRecord('user', service.loginData.uid);
                    // service.clientAlgolia.copyIndex('cards-template', ALGOLIA_INDEX + '-' + service.thisTeam, function(err, content) {
                    service.bootUpRecords(true);
                    // });
                });
            });
        },
        
        bootUpRecords: function(firstTime) {
            /*LOG*/ //console.log('bootUpRecords');
            service.serverConnectToRecords(service.usingTeams)
            .then(function(algoliaIndex) {
                service.connectToFirebaseRecords(firstTime);
                service.connectToAlgolia();
                service.connectToAlgoliaIndex(algoliaIndex);
                service.reorderKeywords(); //Shouldn't be needed once SetWIthPriority kicks in properly
                // service.removeSpinner(); // Needs to be once this is all done (currently twice inside connectToFirebaseRecords)
            });
       },

        connectToFirebase: function(fbInstance) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: connectToFirebase');
            service.firebaseRef = new Firebase(fbInstance);
            service.firebaseUsers = service.firebaseRef.child("users");
            if (service.usingTeams) {
                service.firebaseTeams = service.firebaseRef.child("teams");
            }
        },

        connectToAlgolia: function() { // Needs to be called on page load
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: connectToAlgolia');
            service.clientAlgolia = algoliasearch('RR6V7DE8C8', service.algoliaSearchAPIKey); /* global algoliasearch */
        },
        
        connectToFirebaseRecords: function(firstTime) {
            service.firebaseMain = service.usingTeams ? service.firebaseRef.child("teams/" + service.thisTeam) : service.firebaseRef.child("open");
            service.firebaseCards = service.firebaseMain.child("cards");
            service.firebaseIdentities = service.firebaseMain.child("identities");
            service.firebaseKeywords = service.firebaseMain.child("keywords");
            if (firstTime) {
                service.getInitialIdentity("-K2gZjvQ-Cx2kJvq64Bb") //Hard coding the Team Explaain team ID in like this is probably not such a good idea!
                .then(function() {
                    return service.cloneAllCards(service.firebaseTeams.child("-K2gZjvQ-Cx2kJvq64Bb/cards"), service.initialIdentity);
                }).then(function() {
                        return service.getInitialIdentity(null);
                }).then(function() {
                    setTimeout(function(){ service.updateAllText(); }, 3000); // Really not ideal!
                    service.initialiseFirstCard();
                    service.removeSpinner(); // DUPLICATED IN ELSE STATEMENT - Should really be just once at the end of bootUpRecords
                });
            } else {
                service.getInitialIdentity(null).then(function() {
                    service.initialiseFirstCard();
                    service.removeSpinner(); // DUPLICATED IN IF STATEMENT - Should really be just once at the end of bootUpRecords
                });
            }
        },

        connectToAlgoliaIndex: function(algoliaIndex) { // Needs to be called on page load
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: connectToAlgoliaIndex');
            service.algoliaIndex = service.clientAlgolia.initIndex(algoliaIndex);
        },


        search: function(query, initRun) {
            /*LOG*/ //console.log('query', query);
            var deferred = $q.defer();
            var parameters = {
                hitsPerPage: 20
            };
            service.algoliaIndex.search(query, parameters)
            .then(function searchSuccess(content) {
                var hits = content.hits;
                initRun ? $rootScope.$apply() : null;
                deferred.resolve(hits);
            })
            .catch(function searchError(err) {
                console.error(err);
                deferred.reject();
            });
            return deferred.promise;
        },

        initialiseFirstCard: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: initialiseFirstCard');
            console.log('opening first card');
            console.log(initialIdentity);
            console.log('initialiseFirstCard');
            service.open(service.initialIdentity, false);
        },

        removeSpinner: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: removeSpinner');
            if (firstCard) {
                firstCard = false;
                var element = document.getElementById("spinner");
                element.parentNode.removeChild(element);
            }
        },
        
        singularToPlural: function(singular) {
            var mapping = {
                'user': 'users',
                'card': 'cards',
                'identity': 'identities',
                'keyword': 'keywords'
            };
            return mapping[singular];
        },
        
        getRecordKey: function(record) {
            var key = record.data ? record.data.objectID || record.objectID : record.objectID;
            return key;
        },
        
        records: function(recordType) { // Not sure whether this returns a reference or a copy
            return service[service.singularToPlural(recordType)];
        },
        
        recordsIndex: function(recordType, i) {
            return service[service.singularToPlural(recordType)][i];
        },
        
        recordsIndexOf: function(recordType, record) {
            return service[service.singularToPlural(recordType)].indexOf(record);
        },
        
        // recordsRecord: function(recordType, key) { // Don't think this function is needed (recordImported does the job)
        //     return service.recordsIndex(recordType, service.recordsIndexOf(record));
        // },
        
        recordsPush: function(recordType, record) {
            return service[service.singularToPlural(recordType)].push(record); // Returns new length
        },
        
        recordsInclude: function(recordType, record) { // Either pushes or replaces
            var key = service.getRecordKey(record);
            var position = service.recordKeyPos(recordType, key);
            if (position != -1) {
                service[service.singularToPlural(recordType)][position] = record;
            } else {
                service.recordsPush(recordType, record);
            }
        },
        
        recordKeyPos: function(recordType, key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: recordKeyPos', recordType, key);
            var record = service.recordImported(recordType, key);
            return service.recordsIndexOf(recordType, record);
        },

        recordImported: function(recordType, key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: recordImported', recordType, key);
            var record = $.grep(service.records(recordType), function(e) {
                return service.getRecordKey(e) == key;
            })[0] || null;
            return record;
        },
        
        localRecordSet: function(recordType, key, property, value) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: localRecordSet', recordType, key, property, value);
            var position = service.recordKeyPos(recordType, key);
            service[service.singularToPlural(recordType)][position][property] = value;
        },

        getRecord: function(recordType, key, forceReImport, allowNotExisting) { // reImport should be false if this is being called constantly. allowNotExisting if this record may have already legitimately been deleted and getRecord is only being used to keep it up to date, not to retrieve it
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getRecord', recordType, key, forceReImport);
            var deferred = $q.defer();
            var record = service.recordImported(recordType, key);
            if (forceReImport || !record) {
                service.importRecord(recordType, key, true)
                .then(function(record) {
                    deferred.resolve(record);
                });
            } else {
                deferred.resolve(record);
            }
            return deferred.promise;
        },

        importRecord: function(recordType, key, allowNotExisting) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importRecord', recordType, key);
            var deferred = $q.defer();
            service.getCorrectFirebaseSet(recordType).child(key).once('value', function(snapshot) {
                if (allowNotExisting && !snapshot.val()) {
                    deferred.resolve();
                } else {
                    var record = service.recordImported(recordType, key) || { objectID: snapshot.key() };
                    record.data = snapshot.val();
                    if (recordType == 'card') {
                        service.getRecord('identity', record.data.identity);
                        record.data.authorId ? service.getRecord('user', record.data.authorId) : null;
                    }
                    service.ifIdentityThenGetKeywords(recordType, record)
                    .then(function(record) {
                        service.recordsInclude(recordType, record);
                        deferred.resolve(record);
                    });
                }
            },
            function(error) {
                deferred.reject();
            });
            return deferred.promise;
        },
        
        ifIdentityThenGetKeywords: function(recordType, record) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: ifIdentityThenGetKeywords', recordType, record);
            var deferred = $q.defer();
            if (recordType == 'identity') {
                var identityKey = service.getRecordKey(record);
                service.getIdentityKeywords(identityKey)
                .then(function(keywords) {
                    record.data.keywords = keywords;
                    deferred.resolve(record);
                });
            } else {
                deferred.resolve(record);
            }
            return deferred.promise;
        },

        // reImportRecord: function(recordType, key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reImportRecord', key);
        //     var deferred = $q.defer();
        //     service.getCorrectFirebaseSet(recordType).child(key).once('value', function(snapshot) {
        //         var record = service.recordImported(recordType, key);
        //         record.data = snapshot.val();
        //         service.recordsInclude(recordType, record);
        //         resolve(record);
        //     }, function(error) {
        //         reject(-1);
        //     });
        //     return deferred.promise;
        // },
        
        
        

        // cardKeyPos: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cardKeyPos', key);
        //     var card = service.cardImported(key);
        //     return service.cards.indexOf(card);
        // },

        // identityKeyPos: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: identityKeyPos', key);
        //     var identity = service.identityImported(key);
        //     return service.identities.indexOf(identity);
        // },

        // keywordKeyPos: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: keywordKeyPos', key);
        //     var keyword = service.keywordImported(key);
        //     return service.keywords.indexOf(keyword);
        // },

        // userKeyPos: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: userKeyPos', key);
        //     var user = service.userImported(key);
        //     return service.users.indexOf(user);
        // },

        // cardImported: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cardImported', key);
        //     var card = $.grep(service.cards, function(e) {
        //         return e.objectID == key;
        //     })[0];
        //     if (!card) {
        //         card = null
        //     };
        //     return card;
        // },

        // identityImported: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: identityImported', key);
        //     var identity = $.grep(service.identities, function(e) {
        //         return e.objectID == key;
        //     })[0];
        //     if (!identity) {
        //         identity = null
        //     };
        //     return identity;
        // },

        // keywordImported: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: keywordImported', key);
        //     var keyword = $.grep(service.keywords, function(e) {
        //         return e.objectID == key;
        //     })[0];
        //     return keyword;
        // },

        // userImported: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: userImported', key);
        //     var user = $.grep(service.users, function(e) {
        //         return e.data.uid == key;
        //     })[0];
        //     /*LOG*/ //console.log(user);
        //     return user;
        // },
        
        getInitialIdentity: function(team) {
            /*LOG*/ //console.log("team: " + team);
            return $q(function(resolve, reject) {
                var tempFirebaseMain = team ? service.firebaseTeams.child(team) : service.firebaseMain;
                tempFirebaseMain.child("settings").once('value', function(snapshot) {
                    service.initialIdentity = snapshot.val().initialIdentity;
                    resolve();
                });
            });
        },

        // getCard: function(key, reImport) { // reImport should be false if this is being called constantly
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getCard', key, reImport);
        //     return $q(function(resolve, reject) {
        //         var card = service.cardImported(key);
        //         /*LOG*/ //console.log('card1', card);
        //         if (card) {
        //             /*LOG*/ //console.log('reImport', reImport);
        //             if (reImport) {
        //                 /*LOG*/ //console.log('yep');
        //                 service.reImportCard(key).then(function() {
        //                     /*LOG*/ //console.log('service.cards 1');
        //                     /*LOG*/ //console.log(service.cards);
        //                     resolve(card);
        //                 });
        //             }
        //             else {
        //                 /*LOG*/ //console.log('nope');
        //                     /*LOG*/ //console.log('service.cards 2');
        //                     /*LOG*/ //console.log(service.cards);
        //                 resolve(card);
        //             }
        //         }
        //         else {
        //             var promise = service.importCard(key);
        //             promise.then(function(tempCard) {
        //                 /*LOG*/ //console.log('tempCard', tempCard);
        //                 card = tempCard;
        //                     /*LOG*/ //console.log('service.cards 3');
        //                     /*LOG*/ //console.log(service.cards);
        //                 resolve(card);
        //             });
        //         }
        //     });
        // },

        // getIdentity: function(key) { //Needs reImport parameter?
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getIdentity', key);
        //     return $q(function(resolve, reject) {
        //         var identity = service.identityImported(key);
        //         if (identity) {
        //             resolve(identity);
        //         }
        //         else {
        //             var promise = service.importIdentity(key);
        //             promise.then(function(tempIdentity) {
        //                 identity = tempIdentity;
        //                 resolve(identity);
        //             });
        //         }
        //     });

        // },

        // getKeyword: function(key) { //Not yet used, and may well not be while all text structuring is done on the front end
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getKeyword', key);
        //     return $q(function(resolve, reject) {
        //         var keyword = service.keywordImported(key);
        //         if (keyword) {
        //             resolve(keyword);
        //         }
        //         else {
        //             var promise = service.importKeyword(key);
        //             promise.then(function(tempKeyword) {
        //                 keyword = tempKeyword;
        //                 resolve(keyword);
        //             });
        //         }
        //     });

        // },

        // getUser: function(key) { //Needs reImport parameter?
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getUser', key);
        //     return $q(function(resolve, reject) {
        //         if (!key) {
        //             resolve(null);
        //         }
        //         else {
        //             var user = service.userImported(key);
        //             if (user) {
        //                 resolve(user);
        //             }
        //             else {
        //                 var promise = service.importUser(key);
        //                 promise.then(function(tempUser) {
        //                     user = tempUser;
        //                     /*LOG*/ //console.log('user');
        //                     /*LOG*/ //console.log(user);
        //                     resolve(user);
        //                 });
        //             }
        //         }
        //     });

        // },
        
        getThisUserTeam: function() {
            /*LOG*/ //console.log('getThisUserTeam');
            var deferred = $q.defer();
            var key = service.loginData.uid;
            service.getUserTeam(key).then(function(team) {
                deferred.resolve(team);
            });
            return deferred.promise;
        },
        
        getUserTeam: function(key) {
            var deferred = $q.defer();
            service.getRecord('user', key).then(function(user) {
                var team = user.data.teams ? user.data.teams[0] : null;
                deferred.resolve(team);
            });
            return deferred.promise;
        },

        // importCard: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importCard', key);
        //     return $q(function(resolve, reject) {
        //         service.firebaseCards.child(key).once('value', function(snapshot) {
        //                 /*LOG*/ //console.log(snapshot.val());
        //                 var newCard = {
        //                     data: snapshot.val(),
        //                     objectID: snapshot.key(),
        //                     editing: false,
        //                     atFront: false,
        //                     showing: false,
        //                 };

        //                 service.getIdentity(newCard.data.identity).then(function() {
        //                     service.getUser(newCard.data.authorId).then(function(user) {
        //                         // newCard.author = user;
        //                         /*LOG*/ //console.log('user: ', user);
        //                         var foundCard = service.cardImported(key); //This checks again at the last minute - is this really the most efficient way of doing it?
        //                         /*LOG*/ //console.log('foundCard test: ' + key);
        //                         /*LOG*/ //console.log(foundCard);
        //                         service.removeSpinner();
        //                         if (!foundCard) {
        //                             var length = service.cards.push(newCard);
        //                             resolve(service.cards[length - 1]);
        //                         } else {
        //                             resolve(foundCard);
        //                         }
        //                     });
        //                 });

        //             },
        //             function(error) {
        //                 reject(-1);
        //             });
        //     });
        // },

        // importIdentity: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importIdentity', key);
        //     return $q(function(resolve, reject) {
        //         service.firebaseIdentities.child(key).once('value', function(snapshot) {
        //             service.getIdentityKeywords(key).then(function(keywordsTemp) {
        //                 var newIdentity = {
        //                     data: snapshot.val(),
        //                     objectID: snapshot.key(),
        //                     keywords: keywordsTemp
        //                 };
        //                 var foundIdentity = service.identityImported(key); //This checks again at the last minute - is this really the most efficient way of doing it?
        //                 /*LOG*/ //console.log('foundIdentity test: ' + key);
        //                 /*LOG*/ //console.log(foundIdentity);
        //                 if (!foundIdentity) {
        //                     var length = service.identities.push(newIdentity);
        //                     resolve(service.identities[length - 1]);
        //                 } else {
        //                     resolve(foundIdentity);
        //                 }
        //             })
        //         }, function(error) {
        //             reject(-1);
        //         });
        //     });
        // },

        // importKeyword: function(key) { //Not yet used, and may well not be while all text structuring is done on the front end
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importKeyword', key);
        //     return $q(function(resolve, reject) {
        //         service.firebaseKeywords.child(key).once('value', function(snapshot) {

        //             var newKeyword = {
        //                 data: snapshot.val(),
        //                 objectID: snapshot.key()
        //             };

        //             var length = service.keywords.push(newKeyword);
        //             resolve(service.keywords[length - 1]);

        //         }, function(error) {
        //             reject(-1);
        //         });
        //     });

        // },

        // importUser: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importUser', key);
        //     return $q(function(resolve, reject) {
        //         service.firebaseUsers.child(key).once('value', function(snapshot) {

        //             var newUser = {
        //                 data: snapshot.val()
        //             };

        //             var length = service.users.push(newUser);
        //             resolve(service.users[length - 1]);

        //         }, function(error) {
        //             reject(-1);
        //         });
        //     });
        // },

        // reImportCard: function(key) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reImportCard', key);
        //     return $q(function(resolve, reject) {
        //         service.firebaseCards.child(key).once('value', function(snapshot) {
        //             service.cards[service.recordKeyPos('card', key)].data = snapshot.val();
        //             resolve(service.cards[service.cardKeyPos(key)]);
        //         }, function(error) {
        //             reject(-1);
        //         });
        //     });
        // },
        
        cloneAllCards: function(cardSet, initialIdentity) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cloneAllCards', cardSet, initialIdentity);
            return $q(function(resolve, reject) {
                cardSet.on('child_added', function(snapshot) {
                    if (snapshot.val().identity == initialIdentity) {
                        var thisIsInitial = true;
                    }
                    service.cloneCard(snapshot.val(), thisIsInitial).then(function() {
                        if (thisIsInitial) {
                            console.log('Clone all cards - resolving after initial identity');
                            resolve();
                        }
                    });
                });
            });
            
            //-----------Still haven't figured out how to do this....
            // return $q.all(myPromises).then(function() {
            //     /*LOG*/ //console.log('resolving');
            // });
        },
        
        OLD_cloneCard: function(originalCardData, thisIsInitial) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cloneCard', originalCardData, thisIsInitial);
            return $q(function(resolve, reject) {
                originalCardData.objectID = null;
                originalCardData.dateCreated = Date.now();
                originalCardData.identity = null;
                var newCardData = originalCardData;
                var newCard = service.firebaseCards.push();
                var key = newCard.key();
                newCardData.objectID = key;
                newCard.set(newCardData, function(error) {
                    service.addNewIdentity(key, newCardData.title, thisIsInitial);
                    // service.algoliaAdd(newCardData, key); // This needs to use callbacks etc
                    resolve();
                });
            });
        },
        
        cloneCard: function(originalCardData, thisIsInitial) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cloneCard', originalCardData, thisIsInitial);
            var deferred = $q.defer();
            originalCardData.objectID = null;
            originalCardData.dateCreated = Date.now();
            originalCardData.identity = null;
            var cardData = originalCardData;
            
            service.changeRecord(cardData, 'card', 'create', {}) // Could potentially pass in a function to be run between push() and set() - e.g. addNewIdentity()
            .then(function(newCardData) { // Assumes card needs to create a new identity
                cardData = newCardData;
                return service.addNewIdentity(cardData.objectID, cardData.title, thisIsInitial);
            }).then(function(identityKey) {
                cardData.identity = identityKey;
                return service.updateCard(cardData.objectID, cardData);
            }).then(function() {
                deferred.resolve(cardData);
            });
            return deferred.promise;
        },
        
        addNewCard: function(cardData, format, open, autoPopulate, edit) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewCard', cardData, format, open, autoPopulate, edit);
            var deferred = $q.defer();
            cardData.dateCreated = Date.now();
            cardData.authorId = service.loginData.uid || null;
            cardData.format = format;
            
            cardData = angular.fromJson(angular.toJson(cardData));
            
            service.changeRecord(cardData, 'card', 'create', {}) // Could potentially pass in a function to be run between push() and set() - e.g. addNewIdentity()
            .then(function(newCardData) { // Assumes card needs to create a new identity
                cardData = newCardData;
                return service.addNewIdentity(cardData.objectID, cardData.title, false);
            }).then(function(identityKey) {
                cardData.identity = identityKey;
                return service.updateCard(cardData.objectID, cardData);
            }).then(function() {
                return open ? service.open(cardData.identity, edit) : $q(function(resolve, reject) {deferred.resolve()}) ;
            }).then(function() {
                deferred.resolve(cardData);
            });
            return deferred.promise;
        },
        
        addNewIdentity: function(initialCardKey, initialKeyword, thisIsInitial) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewIdentity', initialCardKey, initialKeyword, thisIsInitial);
            var deferred = $q.defer();
            var identityData = {
                cards: [{
                    key: initialCardKey,
                    rank: 0
                }]
            };
            service.changeRecord(identityData, 'identity', 'create', {})
            .then(function(newIdentityData) {
                var newkeywordData = {
                    keyword: initialKeyword,
                    identityRef: newIdentityData.objectID
                };
                service.addNewKeyword(newkeywordData, false);
                console.log('newIdentityData', newIdentityData.objectID);
                thisIsInitial ? service.firebaseMain.child("settings").update({initialIdentity: newIdentityData.objectID}) : null ;
                deferred.resolve(newIdentityData.objectID);
            });
            return deferred.promise;
        },

        appendKeyword: function(keyword, identityKey) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: appendKeyword', keyword, identityKey);
            var deferred = $q.defer();
            var keywordData = {
                keyword: keyword,
                identityRef: identityKey
            };
            service.addNewKeyword(keywordData, true)
            .then(function(newKeywordData, key) {
                newKeywordData.objectID = key;
                var newKeyword = {
                    data: newKeywordData,
                    objectID: key // Ideally this shouldn't be needed
                };
                service.getRecord('identity', identityKey); // Makes sure identity updates to include new keyword
                deferred.resolve(newKeyword);
            });
            return deferred.promise;
        },
        
        testForRepeat: function(fbRef, myChild, myEqualTo) {
            var deferred = $q.defer();
            fbRef.orderByChild(myChild).equalTo(myEqualTo).once('value', function(snapshot) {
                if (snapshot.val() !== null) {
                    console.log('object with same ' + myChild + ' already exists'); deferred.reject();
                } else {
                    deferred.resolve();
                }
            });
            return deferred.promise;
        },
        
        addNewKeyword: function(keywordData, showToast) {
            var deferred = $q.defer();
            if (keywordData.keyword.length < 2) { console.log('Keyword is too short'); deferred.reject(); }
            service.testForRepeat(service.firebaseKeywords, 'keyword', keywordData.keyword)
            .then(function() {
                keywordData.keywordLength = keywordData.keyword.length * -1;
                return service.changeRecord(keywordData, 'keyword', 'create', { priority: keywordData.keywordLength });
            }).then(function(newKeywordData) {
                service.updateAllText(newKeywordData.keyword);
                deferred.resolve(newKeywordData);
            });
            return deferred.promise;
        },
        
        updateCard: function(key, cardData) {
            var deferred = $q.defer();
            cardData = angular.fromJson(angular.toJson(cardData));
            service.appendKeyword(cardData.title, cardData.identity);
            service.changeRecord(cardData, 'card', 'update', {})
            .then(function() {
                return service.importRecord('card', key, true);
            }).then(function() {
                deferred.resolve();
            });
            return deferred.promised;
        },
        
        deleteCard: function(cardKey, card) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteCard', cardKey, card);
            var identityKey = card.data.identity || null;
            service.changeRecord(card.data, 'card', 'delete', {})
            .then(function() {
                service.cards.splice(service.recordKeyPos('card', cardKey), 1);
                service.deleteIdentity(identityKey); //Needs to only be if the identity has no more cards left
            });
        },
        
        deleteIdentity: function(identityKey) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteIdentity', identityKey);
            service.changeRecord({objectID: identityKey}, 'identity', 'delete', {})
            .then(function() {
                service.identities.splice(service.recordKeyPos('identity', identityKey), 1);
                service.deleteIdentityKeywords(identityKey);
            });
        },
        
        deleteKeyword: function(keywordKey, identityKey, keywordText) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteKeyword', keywordKey, identityKey, keywordText);
            service.changeRecord({objectID: keywordKey}, 'keyword', 'delete', {})
            .then(function() {
                service.keywords.splice(service.recordKeyPos('keyword', keywordKey), 1);
                service.getRecord('identity', identityKey, true, true);
                service.updateAllText(keywordText);
            });
        },

        getIdentityKeywords: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getIdentityKeywords', key);
            return $q(function(resolve, reject) {
                var identityKeywords = [];
                service.firebaseKeywords.orderByChild("identityRef").equalTo(key).on("child_added", function(snapshot) {
                    var keyword = {
                        data: snapshot.val(),
                        objectID: snapshot.key()
                    };
                    identityKeywords.push(keyword);
                });
                $q.all(identityKeywords).then(function() {
                    console.log('identityKeywords', identityKeywords);
                    resolve(identityKeywords);
                });
            });
        },

        getCardFromIdentity: function(identity) {
            //Assumes for now that you don't need to import anything
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getCardFromIdentity', identity);
            var cardKey = identity.data.cards[0].key; //Currently just selects the first card in the identity's 'cards' array
            return cardKey;
        },

        getCardAuthorDetails: function(card) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getCardAuthorDetails', card);
            var authorId = card.data.authorId;
            var author = service.users[service.recordKeyPos('user', authorId)]; // This assumes user has already been imported - should we use getAuthor instead?
            return author;
        },

        getAuthorProfile: function(key) { // This assumes identity has already been imported - need to make sure this happens first
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getAuthorProfile', key);

            key ? service.getRecord('identity', key) : null;

            var identityPos = key ? service.recordKeyPos('identity', key) : null;
            var identity = identityPos != -1 ? service.identities[identityPos] : null;
            console.log('identity', identity);

            if (identity) {
                identity.data ? service.getRecord('card', service.getCardFromIdentity(identity)) : null;
            }

            var cardPos = identity ? service.recordKeyPos('card', service.getCardFromIdentity(identity)) : null;
            var card = cardPos != -1 ? service.record['card', cardPos] : null;
            console.log('card', card);
            var authorProfile = card ? {
                title: card.data.title,
                subtitle: card.data.subtitle,
                image: card.data.image
            } : {};
            console.log('authorProfile', authorProfile);
            return authorProfile;


            // return $q(function(resolve, reject) {
            //     var identity, card;
            //     service.getIdentity(key).then(function(tempIdentity) {
            //         identity = tempIdentity;
            //         service.getCard(service.getCardFromIdentity(identity)).then(function(card) {
            //             var authorProfile = card ? {
            //                 title: card.data.title,
            //                 subtitle: card.data.subtitle,
            //                 image: card.data.image
            //             } : {};
            //             resolve(authorProfile);
            //         });
            //     });
            // });

        },

        getQuoteAuthorOptions: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getQuoteAuthorOptions');
            return service.cards;
        },

        getLinksfromText: function(structure) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getLinksfromText', structure);
            var textLinks = [];
            for (var i = 0; i < structure.length; i++) {
                if (structure[i].type == 'link' & textLinks.indexOf(structure[i].ref) == -1) {
                    textLinks.push(structure[i].ref);
                }
            }
            return textLinks;
        },

        moveCardToFront: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: moveCardToFront', key);
            for (var i = 0; i < service.cards.length; i++) {
                if (service.cards[i].objectID == key) {
                    service.cards[i].showing = true;
                    service.cards[i].atFront = true;
                }
                else {
                    service.cards[i].atFront = false;
                }
            }
        },

        openFromCardKey: function(cardKey, edit) { //For now just selects identity from card and then acts as normal (so will select the most popular card from that identity)
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: openFromCardKey', cardKey, edit);
            service.getRecord('card', cardKey, true).then(function(card) {
                service.open(card.data.identity, edit);
            });
        },

        open: function(identityKey, edit) {
            var deferred = $q.defer();
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: open', identityKey, edit);
            var cardKey;
            service.getRecord('identity', identityKey)
            .then(function(identity) {
                cardKey = service.getCardFromIdentity(identity);
                return service.getRecord('card', cardKey, true);
            }).then(function(card) {
                service.moveCardToFront(card.objectID);
                console.log('edit:', edit);
                console.log('card.editing:', card.editing);
                console.log('logic:', edit && !card.editing);
                edit && !card.editing ? service.toggleEditCard(cardKey) : null;
                
                deferred.resolve();
                
                setTimeout(function(){
                    $(function () {
                      $('[data-toggle="tooltip"]').tooltip();
                    })
                    $('.icon-tooltip').tooltip();
                }, 1000);
                

                //The stuff below is for importing the next set of cards before you click on any of them - needs testing and making sure it happens AFTER this card has loaded properly, so user doesn't notice
                // var linkedCardsToImport = $scope.getLinksfromText($scope.localCards[localCardRef.ref].bio.structure);
                // for (i = 0; i < linkedCardsToImport.length; i++) {
                //     $scope.getIdentity(linkedCardsToImport[i]).then(function(localIdentityRef3) {
                //         cardKey2 = $scope.localIdentities[localIdentityRef3.ref].cards[0].key;
                //         $scope.getCard(cardKey2).then(function(localCardRef2) {
                //         });
                //     });
                // }
            });
            return deferred.promise;
        },

        close: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: close', key);
            service.localRecordSet('card', key, 'showing', false);
            service.localRecordSet('card', key, 'atFront', false);
        },

        toggleEditMode: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: toggleEditMode');
            console.log('toggling edit mode');
            service.editMode = !service.editMode;
            // if (editMode) {
            //     $scope.showSimpleToast("Edit mode is on");
            // }
            // else {
            //     $scope.showSimpleToast("Edit mode is off");
            // }
        },

        toggleEditCard: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: toggleEditCard', key);
            var pos = service.recordKeyPos('card', key);
            service.cards[pos].editing = !service.cards[pos].editing;
        },

        populateFromWikipedia: function(key, cardData) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: populateFromWikipedia', key, cardData);
            var title = cardData.title;
            $http.jsonp('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&lllimit=500&titles=' + title + '&callback=JSON_CALLBACK&formatversion=2'). /* global $http */
            success(function(data) {
                cardData.bio !== undefined ? cardData.bio = {} : null;
                if (data.query.pages[0].extract.length > 5) {
                    cardData.sources = cardData.sources ? cardData.sources : [];
                    var sourceExists = cardData.sources ? $.grep(cardData.sources, function(e) {
                        return e.url == 'https://en.wikipedia.org/';
                    }) : [];
                    !sourceExists.length ? cardData.sources.push({
                        title: 'Wikipedia',
                        url: 'https://en.wikipedia.org/'
                    }) : null; //Currently only works if bio works (not necessarily if image does)
                    cardData.bio.value = service.nSentencesMChars(service.htmlToPlaintext(data.query.pages[0].extract), 2, 450);
                }
                /*LOG*/ //console.log('cardData', cardData);
                $http.jsonp('https://en.wikipedia.org/w/api.php?&format=json&&callback=JSON_CALLBACK&formatversion=2&action=query&titles=' + title + '&prop=pageimages&format=json&pithumbsize=200').
                success(function(data) {
                    if (cardData.image === undefined) {
                        cardData.image = {};
                    }
                    cardData.image.value = data.query.pages[0].thumbnail.source;
                    /*LOG*/ //console.log('cardData', cardData);
                    service.cards[service.recordKeyPos('card', key)].data = cardData; //Pretty sure this won't work now we're inside a service!
                });
            });
        },

        htmlToPlaintext: function(text) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: htmlToPlaintext', text);
            var text1 = String(text).replace(/<[^>]+>.<[^>]+>|\s\s+/gm, ' ').replace(/<[^>]+>|\;|\(.*\) |\(.*\)/gm, '').replace(/<[^>]+>.<[^>]+>|\s\s+/gm, ' ').replace('( ', '(');
            return text1.replace('&crarr;', ' ');
        },

        nSentencesMChars: function(text, n, m) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: nSentencesMChars', text, n, m);
            var maxChars = text.substring(0, m);
            var split = maxChars.split(". ");
            var shorterSplit;
            for (var i = n; i > 0; i--) {
                shorterSplit = split.slice(0, i);
                if (shorterSplit.length < split.length) {
                    return shorterSplit.join(". ") + ".";
                }
            }
            return shorterSplit.join(". ") + "...";
        },
        
        structureAllCardText: function(cardData, keywordText) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: structureAllCardText', cardData);
            if (cardData.textStructures) {
                for (i=0; i < cardData.textStructures.length; i++) {
                    if (cardData[cardData.textStructures[i]][0]) { //This handles lists but not yet 2-dimensional arrays (e.g. for tables)
                        for (j=0; j < cardData[cardData.textStructures[i]].length; j++) {
                            if (!keywordText || cardData[cardData.textStructures[i]][j].value.indexOf(keywordText) != -1) {
                                cardData[cardData.textStructures[i]][j].structure = [];
                                cardData[cardData.textStructures[i]][j].structure = service.structureText(-1, cardData[cardData.textStructures[i]][j].value, service.orderedKeywords);
                            }
                        }
                    } else {
                        if (!keywordText || cardData[cardData.textStructures[i]].value.indexOf(keywordText) != -1) {
                            cardData[cardData.textStructures[i]].structure = []; // Shouldn't be needed, no?
                            cardData[cardData.textStructures[i]].structure = service.structureText(-1, cardData[cardData.textStructures[i]].value, service.orderedKeywords);
                        }
                    }
                }
            } else if (cardData.bio) { // Eventually this won't be needed
                cardData.bio.structure = [];
                cardData.bio.structure = service.structureText(-1, cardData.bio.value, service.orderedKeywords);
            }
            
            return cardData;
        },
        
        // structureAllCardText: function(cardData) {
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: structureAllCardText', cardData);
        //     if (cardData.textStructures) {
        //         for (i=0; i < cardData.textStructures.length; i++) {
        //             /*LOG*/ //console.log(cardData.textStructures[i]);
        //             /*LOG*/ //console.log(cardData[cardData.textStructures[i]]);
        //             if (cardData[cardData.textStructures[i]][0]) { //This handles lists but not yet 2-dimensional arrays (e.g. for tables)
        //                 for (j=0; j < cardData[cardData.textStructures[i]].length; j++) {
        //                     /*LOG*/ //console.log(cardData[cardData.textStructures[i]][j]);
        //                     cardData[cardData.textStructures[i]][j].structure = [];
        //                     cardData[cardData.textStructures[i]][j].structure = service.structureText(-1, cardData[cardData.textStructures[i]][j].value, service.orderedKeywords);
        //                 }
        //             } else {
        //                 cardData[cardData.textStructures[i]].structure = [];
        //                 cardData[cardData.textStructures[i]].structure = service.structureText(-1, cardData[cardData.textStructures[i]].value, service.orderedKeywords);
        //             }
        //         }
        //     } else { // Eventually this won't be needed
        //         cardData.bio.structure = [];
        //         cardData.bio.structure = service.structureText(-1, cardData.bio.value, service.orderedKeywords);
        //     }
            
        //     return cardData;
        // },

        structureText: function(identityKey, text, keywords) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: structureText', identityKey, text);
            var structuredText = [{
                text: text,
                type: 'span'
            }];

            for (var j = 0; j < keywords.length; j++) {
                if (keywords[j].keyword.length > 0 & (identityKey == -1 || keywords[j].identityRef != identityKey)) {
                    for (var k = 0; k < structuredText.length;) {
                        if (structuredText[k].type != 'link') {
                            var text = structuredText[k].text;
                            var splitSection = text.split(keywords[j].keyword);
                            if (splitSection.length > 0) {
                                var insert = [];
                                for (var m = 0; m < splitSection.length; m++) {
                                    insert[2 * m] = {
                                        type: 'span',
                                        text: splitSection[m]
                                    };
                                    insert[2 * m + 1] = {
                                        type: 'link',
                                        text: keywords[j].keyword,
                                        ref: keywords[j].identityRef
                                    };
                                }
                                insert.pop(); //Remove the very last element
                                var newText = structuredText.slice(0, k);
                                newText = newText.concat(insert);
                                newText = newText.concat(structuredText.slice(k + 1, structuredText.length));
                                structuredText = newText;
                                k += insert.length - 1;
                            }
                        }
                        k++;
                    }
                }
            }
            return structuredText;
        },

        deleteIdentityKeywords: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteIdentityKeywords', key);
            service.firebaseKeywords.orderByChild("identityRef").equalTo(key).on("child_added", function(snapshot) {
                service.deleteKeyword(snapshot.key(), key, snapshot.val().keyword);
            });
        },

        reorderKeywords: function() { //Should render this unecessary by using Firebase's ordered lists with keywordLength as the ordering key
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reorderKeywords');
            return $q(function(resolve, reject) {
                service.orderedKeywords = [];
                service.firebaseKeywords.orderByChild("keywordLength").on("child_added", function(snapshot) {
                    service.orderedKeywords.push(snapshot.val());
                    resolve();
                }, function(error) {
                    reject(-1);
                });
            });
        },

        // updateBiosFromKeyword: function(keywordText) {
        //     //This should update all types of structured text, not just bios
        //     /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateBiosFromKeyword', keywordText);
        //     //Should this use Algolia to search through bios?
        //     //Slightly updated now we have localCards, but still not quite right
        //     service.reorderKeywords().then(function() {
        //         service.firebaseCards.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
        //             var key = snapshot.key();
        //             var bio = snapshot.val().bio ? snapshot.val().bio.value : ''; // Avoids errors with non-bio cards for now
        //             if (bio.indexOf(keywordText) != -1) {
        //                 var structuredBio = service.structureText(snapshot.val().identity, bio, service.orderedKeywords);
        //                 service.firebaseCards.child(key).child('bio').child('structure').set(structuredBio);
        //                 if (service.cardImported(key)) {
        //                     service.importRecord('card', key, true);
        //                 }
        //             }
        //         });
        //     });
        // },

        updateAllText: function(keywordText) { // If you supply a value for keywordText then it only updates text containing that keyword
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllText');
            //Copied and adjusted from updateBiosFromKeyword()
            //Should this use Algolia to search through bios?
            //Slightly updated now we have localCards, but still not quite right
            service.reorderKeywords().then(function() {
                service.firebaseCards.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
                    var key = snapshot.key();
                    var cardData = service.structureAllCardText(snapshot.val(), keywordText);
                    service.firebaseCards.child(key).set(cardData);
                    if (service.recordImported('card', key)) {
                        service.importRecord('card', key, true);
                    }
                });
            });
        },


        /* THe following updateAll... functions haven't been properly cleaned up as a lot of it is (hopefully) temporary anyway */

        updateAllIdentities: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllIdentities');
            var tempIdentityListOfCardKeys = [];
            service.firebaseIdentities.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
                var identityKey = snapshot.key();
                service.firebaseCards.child(snapshot.val().cards[0].key).update({
                    identity: identityKey
                }, function(error) {});

                service.firebaseCards.child(snapshot.val().cards[0].key).on('value', function(cardSnapshot) { //Should this be once() not on() to stop it continuing to do it?

                    if (tempIdentityListOfCardKeys.indexOf(cardSnapshot.key()) == -1) {
                        tempIdentityListOfCardKeys.push(cardSnapshot.key());
                    }
                    else {
                        // $scope.firebaseIdentities.child(snapshot.key()).remove();
                    }
                    if (!cardSnapshot.val().title) {
                        console.log('need to remove this identity: ', snapshot.val());
                        // service.deleteIdentity(snapshot.key());
                        console.log('need to remove this card: ', cardSnapshot.val());
                        // service.deleteCard(cardSnapshot.key(), cardSnapshot.val());

                        service.firebaseKeywords.orderByChild("identityRef").equalTo(snapshot.key()).on("child_added", function(keywordSnapshot) {
                            console.log('need to remove this keyword: ', keywordSnapshot.val());
                            // $scope.firebaseIdentities.child(keywordSnapshot.key()).remove();
                        });
                    }
                });
                // $scope.firebaseCards.child(snapshot.val().cards[0].key).update({
                //     identity: snapshot.key()
                // });
            });
        },

        updateAllCards: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllCards');
            service.reorderKeywords(); //Need a callback here to finish this before proceeding

            service.firebaseCards.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
                var key = snapshot.key();
                // if (!snapshot.val().title) {
                //     /*LOG*/ //console.log('need to remove this card2: ', snapshot.val());
                //     service.deleteCard(snapshot.key(), {
                //         data: snapshot.val()
                //     });
                // }
                // else {
                //     var bio = snapshot.val().bio.value;
                //     var tempStructuredBio = service.structureText(key, bio, service.orderedKeywords);
                //     service.firebaseCards.child(key).child('bio').child('structure').set(tempStructuredBio);
                //     if (service.cardImported(key)) {
                //         service.reImportCard(key);
                //     }
                // }
            });

            //Need multiple callbacks for this
            // $scope.showSimpleToast("Success! You've updated all cards.");






            // var successCount = 0;

            //temp
            // for (var i = 0; i < $scope.globalIdentities.length; i++) { //$scope.globalIdentities no longer exists!
            //     
            //     var identityKey = $scope.globalIdentities[i].objectID;
            //     var firstCardKey = $scope.globalIdentities[i].cards[0].key;
            //     $scope.globalCards.$getRecord(firstCardKey).identity = identityKey;
            // }


            // for (var i = 0; i < $scope.globalCards.length; i++) {
            //     if ($scope.globalCards[i].image) {
            //         // $scope.globalCards[i].image.value = $scope.globalCards[i].image.value.replace("//", "http://");
            //         // $scope.globalCards[i].image.value = $scope.globalCards[i].image.value.replace("https:http://", "https://");
            //     }
            //     $scope.globalCards[i].editing = false; //Shouldn't be necessary as this variable should only exist locally
            //     $scope.globalCards[i].justCreated = false; //Shouldn't be necessary as this variable should only exist locally
            //     var bio = $scope.globalCards[i].bio.value;
            //     $scope.globalCards[i].bio.structure = $scope.structureBio($scope.globalCards.$keyAt(i), bio, $scope.orderedKeywords);

            //     //Can delete this now???
            //     // if (!$scope.globalCards[i].identity) {
            //     //     $scope.addNewIdentity($scope.globalCards[i].objectID);
            //     // }

            //     $scope.globalCards.$save(i).then(function(ref) {
            //         var key = ref.key();
            //         successCount++;
            //         if ($scope.cardImported(key)) {
            //             $scope.reImportCard(key);
            //         }
            //         if (successCount == $scope.globalCards.length) {
            //             $scope.showSimpleToast("Success! You've updated all cards.");
            //         }
            //     });
            // }
        },

        updateAllKeywords: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllKeywords');
            service.firebaseKeywords.on('child_added', function(snapshot) {
                var tempKeywordLength = snapshot.val().keywordLength;
                snapshot.ref().setPriority(tempKeywordLength);
                service.firebaseIdentities.child(snapshot.val().identityRef).once('value', function(identitySnapshot) {
                }, function(error) {
                    service.firebaseKeywords.child(snapshot.key()).remove(function() { //Don't yet know whether this actually works!
                    });
                });
            });

            // for (var i = 0; i < $scope.keywords.length; i++) {
            //     $scope.keywords[i].identityRef = $scope.globalCards.$getRecord($scope.keywords[i].ref).identity;
            //     $scope.keywords[i].keywordLength = $scope.keywords[i].keyword.length * -1; //Maybe now not needed if this happens when new keyword created?

            //     $scope.keywords.$save(i);
            //     if ($scope.globalCards.$getRecord($scope.keywords[i].ref) === null) {
            //         $scope.keywords.$remove(i);
            //     }
            // }
        },

        updateEverything: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateEverything');
            //All of this needs callbacks
            service.updateAllKeywords();
            service.updateAllCards();
            service.updateAllIdentities();
            // $scope.reorderKeywords($scope.updateAllCards);
            if (ctrlKeyDown) {
                service.reImportToAlgolia();
            }
        },

        toggleLogin: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: toggleLogin');
            if (service.loggedIn) {
                service.firebaseRef.unAuth(); //Doesn't currently work for some reason
            }
            else {
                service.logMeIn('twitter');
            }
        },

        logMeIn: function(loginProvider) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: logMeIn', loginProvider);
            var deferred = $q.defer();
            switch (loginProvider) {
                case 'twitter':
                    {
                        service.firebaseRef.authWithOAuthPopup("twitter", function(error, authData) {
                            if (error) {
                                console.log('twitter error');
                                deferred.reject();
                            }
                            else {
                                console.log('twitter success!');
                                service.loggedIn = true;
                                service.loginData = authData;
                                $rootScope.$apply();
                                // service.showSimpleToast("Hello " + authData.twitter.displayName + "! You're now logged in.");

                                service.firebaseUsers.child(authData.uid).update({
                                    uid: authData.uid,
                                    provider: authData.provider,
                                    name: authData.twitter.displayName,
                                    username: authData.twitter.username,
                                    image: authData.twitter.profileImageURL,
                                    url: "http://twitter.com/" + authData.twitter.username
                                }, function(error) {
                                    if(error) {
                                        console.log('error updating user info');
                                        deferred.reject();
                                    } else {
                                        service.importRecord('user', authData.uid)
                                        .then(function() {
                                            deferred.resolve();
                                        });
                                    }
                                });
                            }
                        });
                    }
            }
            return deferred.promise;
        },

        allowingEditMode: function() {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: allowingEditMode');
            if (service.loggedIn | service.godMode) {
                return true;
            }
            else {
                return false;
            }
        },

        cardBelongsToUser: function(card) {
            // /*LOG*/ //console.log((Date.now() - currentTimestamp),currentTimestamp = Date.now(), 'function: cardBelongsToUser', card);
            if ( service.loggedIn && (card.data.authorId == service.loginData.uid) | service.godMode) {
                return true;
            }
            else {
                return false;
            }
        },

        cardCanBeClaimed: function(card) {
            // /*LOG*/ //console.log((Date.now() - currentTimestamp),currentTimestamp = Date.now(), 'function: cardCanBeClaimed', card);
            if (service.loggedIn & card.data.authorId == undefined & !service.godMode) {
                return true;
            }
            else {
                return false;
            }
        },

        claimCard: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: claimCard', key);
            if (service.loggedIn) {
                service.firebaseCards.child(key).update({
                    authorId: service.loginData.uid
                }, function(error) {
                    service.importRecord('card', key, true).then(function() {
                        
                        // $rootScope.$apply();
                    });
                    console.log('Error claiming card - trying a reImport.')
                });
            }
        },

        algoliaAdd: function(card, key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: algoliaAdd', card, key);
            var myObjectID = key;
            // service.algoliaIndex.addObject(card.data, myObjectID, function(err, content) {


            // });
        },

        algoliaUpdate: function(key, card) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: algoliaUpdate', key, card);


            card.data.objectID = key;
            card.$$conf = null; //Probably not necessary to delete all of this (only to prevent "TypeError: Converting circular structure to JSON" error)
            // service.algoliaIndex.saveObject(card.data, function(err, content) {

             
            // });
        },

        algoliaDelete: function(key) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: algoliaDelete', key);
            // service.algoliaIndex.deleteObject(key, function(error) {
            //     if (!error) {

            //     }
            // });
        },





        reImportToAlgolia: function() { //Use this VERY RARELY!!!!!
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reImportToAlgolia');
            // Get all data from Firebase
            service.firebaseCards.on('value', reindexIndex);

            function reindexIndex(dataSnapshot) {
                // Array of objects to index
                var objectsToIndex = [];

                // Create a temp index
                var tempIndexName = 'cards_temp';
                var tempIndex = service.clientAlgolia.initIndex(tempIndexName);

                // Get all objects
                var values = dataSnapshot.val();

                // Process each Firebase object
                for (var key in values) {
                    if (values.hasOwnProperty(key)) {
                        // Get current Firebase object
                        var firebaseObject = values[key];

                        // Specify Algolia's objectID using the Firebase object key
                        firebaseObject.objectID = key;

                        // Add object for indexing
                        objectsToIndex.push(firebaseObject);
                    }
                }

                // Add or update new objects
                service.algoliaIndex.saveObjects(objectsToIndex, function(err, content) {
                    if (err) {
                        throw err;
                    }

                    // Overwrite main index with temp index
                    service.clientAlgolia.moveIndex(tempIndexName, 'cards', function(err, content) {
                        if (err) {
                            throw err;
                        }
                    });
                });
            }
        },
        
        
        
        talkToServer: function(url, type, data) {
            return $q(function(resolve, reject) {
                $.ajax({
                    url: url, 
                    type: 'POST', 
                    contentType: 'application/json',
                    data: JSON.stringify(data),
                    success: function(receivedData) {
                        resolve(receivedData);
                    },
                    error: function() {
                        console.log('Error talking to server', url, type, data);
                        reject();
                    }
                });
            });
        },
        
        serverConnectToServices: function() {
            return $q(function(resolve, reject) {
                var connectionData = {
                    connectTo: 'services'
                };
                service.talkToServer('/connection', 'POST', connectionData)
                .then(function(receivedData) {
                    resolve(receivedData.fbInstance);
                });
            });
        },
        
        serverConnectToRecords: function(usingTeams) {
            return $q(function(resolve, reject) {
                var connectionData = {
                    connectTo: 'records',
                    usingTeams: usingTeams,
                    team: service.thisTeam
                };
                service.talkToServer('/connection', 'POST', connectionData)
                .then(function(receivedData) {
                    console.log(receivedData);
                    service.algoliaSearchAPIKey = receivedData.algoliaSearchAPIKey;
                    resolve(receivedData.algoliaIndex);
                });
            });
        },
        
        
        
        // NEW - doing new data manipulation here instead of server
        
        changeRecord: function(data, recordType, changeType, settings) { 
            var deferred = $q.defer();
            //Should check here whether it already exists & other tests (e.g. keyword length > 1)
            changeType=='create' ? data = service.setDefaults(data, service.getDefaults(recordType)) : null ;
            settings = service.setDefaultFollowUps(recordType, changeType, settings);
            data = service.specialRecordHandling(data, recordType, changeType);
            
            service.changeFirebaseRecord(data, recordType, changeType, settings)
            .then( function() { //This assumes none of these need to wait for any of the others
                // actionFollowUp(data, recordType, settings.followUp.action);
                // dataFollowUp(data, recordType, settings.followUp.data);
                service.changeAlgolia(data, recordType, changeType);
                deferred.resolve(data);
                });
            return deferred.promise;
        },
        
        getCorrectFirebaseSet: function(recordType) {
            var firebaseSets = {
                'user': 'firebaseUsers',
                'card': 'firebaseCards',
                'identity': 'firebaseIdentities',
                'keyword': 'firebaseKeywords'
            };
            return service[firebaseSets[recordType]];
        },
        
        changeFirebaseRecord: function(data, recordType, changeType, settings) {
            var deferred = $q.defer();
            switch (changeType) {
                case 'create':
                    var record = service.getCorrectFirebaseSet(recordType).push();
                    data.objectID = record.key();
                    if (settings.priority) {
                        record.setWithPriority(data, settings.priority, onFirebaseChange);
                    } else {
                        record.set(data, onFirebaseChange);
                    }
                    break;
                case 'update':
                    service.getCorrectFirebaseSet(recordType).child(data.objectID).update(data, onFirebaseChange);
                    break;
                case 'delete':
                    service.getCorrectFirebaseSet(recordType).child(data.objectID).remove(onFirebaseChange);
                    break;
            }
            function onFirebaseChange(error) {
                if(error) {
                    deferred.reject();
                } else {
                    deferred.resolve(data);
                }
            }
            return deferred.promise;
        },
        
        getDefaults: function(recordType) {
            var allDefaults = {
                'user': [
                ],
                'card': [
                    [ 'authorId', null ],
                    [ 'sources', [] ],
                    [ 'format', 'profile' ],
                    [ 'title', '' ]
                ],
                'identity': [
                ],
                'keyword': [
                ],
            };
            return allDefaults[recordType];
        },
        
        setDefaults: function(myObject, defaults) {
            for (var i in defaults) {
                myObject[defaults[i][0]] = myObject[defaults[i][0]] || defaults[i][1];
            }
            return myObject;
        },
        
        setDefaultFollowUps: function(recordType, changeType, settings) {
            var defaultDataFollowUps = {
                create: {
                    card: {
                        changeType: 'create',
                        recordType: 'identity'
                    },
                    identity: {
                        changeType: 'create',
                        recordType: 'keyword'
                    }
                }
            };
            var defaultActionFollowUps = {
                create: {
                },
                update: {
                }
            };
            
            // Temporarily disabled all followups while testing
            // !settings.followUp.data   ? settings.followUp.data   =  defaultDataFollowUps[changeType][recordType]   : null ;
            // !settings.followUp.action ? settings.followUp.action =  defaultActionFollowUps[changeType][recordType] : null ;
            return settings;
        },
        
        cardFormatDefaults: function(data) {
            switch (data.format) {
                case 'profile':
                    data = service.setDefaults(data, [
                        ['bio', {value: '', structure: []}],
                        ['textStructures', ['bio']]
                    ]);
                    break;
                case 'manual':
                    data = service.setDefaults(data, [
                        ['description', {value: '', structure: []}],
                        ['textStructures', []]
                    ]);
                    break;
                case 'list':
                    data = service.setDefaults(data, [
                        [ 'intro', {value: ''} ],
                        [ 'list', [{value: ''}] ],
                        [ 'outro', {value: ''} ],
                        ['textStructures', ['intro', 'list', 'outro']]
                    ]);
                    break;
                case 'embed':
                    data = service.setDefaults(data, [
                        ['embed', {value: '', structure: []}],
                        ['textStructures', []]
                    ]);
                    break;
                case 'image':
                    data = service.setDefaults(data, [
                        ['image', {value: '', structure: []}],
                        ['textStructures', []]
                    ]);
                    break;
            }
            return data;
        },
        
        specialRecordHandling: function(data, recordType, changeType) {
            switch (recordType) {
                case 'card':
                    if (changeType=='create') { data = service.cardFormatDefaults(data); }
                    data = service.structureAllCardText(data);
                    break;
            }
            return data;
        },
        
        actionFollowUp: function(data, recordType, followUp) {
            //Need Stuff Here
        },
        
        dataFollowUp: function(prevData, prevRecordType, followUp) {
            var followUpData = {
                card: {
                    identity: {
                        cards: [prevData.objectID]
                    }
                },
                identity: {
                    keyword: {
                        identity: prevData.objectID
                    }
                }
            };
            
            // Temporarily disabled all data followups while testing
            // changeRecord(followUpData[prevRecordType][followUp.recordType], followUp.recordType, followUp.updateType);
        },
        
        changeAlgolia: function(data, recordType, changeType) {
            //Need Stuff Here
        },
        
        
        //NEW (using backend) data maniuplation
        
        NEW_addNewCard: function(cardData, format, open, autoPopulate, edit) {
            /*LOG*/ //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewCard', cardData, open, autoPopulate, edit);
            
            cardData.authorId = service.loginData.uid || null;
            
            if (format=="list") { //Need to do all this properly
                cardData.intro = {value: ''};
                cardData.list = [{value: ''}];
                cardData.outro = {value: ''};
            }
            if (format=="image") { //Need to do all this properly
                cardData.imageMain = {value: ''};
            }
            
            service.serverChangeRecord(cardData, 'card', 'create', {})
            .then(function(receivedData) {
                // Temporarily disabled followUps while testing
                // open ? openFromCardKey(receivedData.cardData.objectID, edit) : null ;
            });
        },
        
        serverChangeRecord: function(data, recordType, changeType, settings) {
            return $q(function(resolve, reject) {
                var transferData = {
                    data: data,
                    recordType: recordType,
                    changeType: changeType,
                    settings: settings
                };
                service.talkToServer('/change-record', 'POST', transferData)
                .then(function(receivedData) {
                    console.log('receivedData', receivedData);
                    resolve(receivedData);
                });
            });
        }
        
        
        
        

    };

    return service;

}]);












app.directive('ngToast', ['$mdToast', function($mdToast) { // Not yet connected up to other services/controllers
    return {
        restrict: 'E',
        // require: 'ExplaainCtrl',
        link: function(scope, elem, attrs) {

            scope.toastPosition = {
                bottom: false,
                top: true,
                left: false,
                right: true
            };

            scope.getToastPosition = function() {
                return Object.keys(scope.toastPosition)
                    .filter(function(pos) {
                        return scope.toastPosition[pos];
                    })
                    .join(' ');
            };

            scope.showSimpleToast = function(message) {
                $mdToast.show(
                    $mdToast.simple()
                    .content(message)
                    .position(scope.getToastPosition())
                    .hideDelay(3000)
                );
            };
        }
    }
}]);









app.directive('ngUserInterface', ['Cards', function(Cards) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {

    
            scope.usingTeams = function() {
                return Cards.usingTeams;
            };
            scope.allowCreate = function() {
                return Cards.loggedIn || Cards.godMode;
            };
            scope.loggedIn = function() {
                return Cards.loggedIn;
            };
            scope.allowingEditMode = function() {
                return Cards.allowingEditMode();
            };
            scope.getEditMode = function() {
                return Cards.editMode;
            };
            scope.showingFilter = function(card) {
                return card.showing;
            };
            scope.loginData = function() {
                return Cards.loginData;
            };
            scope.search = function(query) {
                scope.hits = Cards.hits;
                return Cards.search(query);
            };

            scope.bootUpServices = function(usingTeams) {
                Cards.bootUpServices(usingTeams);
            };
            scope.bootUpNewTeam = function(teamTitle) {
                Cards.bootUpNewTeam(teamTitle);
            };
            

            scope.toggleLogin = function() {
                Cards.toggleLogin();
            };
            scope.toggleEditMode = function() {
                Cards.toggleEditMode();
            };
            scope.updateEverything = function() {
                Cards.updateEverything();
            };
            scope.addNewCard = function(cardData, format, open, autoPopulate, edit) {
                Cards.addNewCard(cardData, format, open, autoPopulate, edit);
            };
        }
    };
}]);


app.directive('ngCard', ['Cards', function(Cards) {
    return {
        restrict: 'E',
        templateUrl: 'html/card.html',
        link: function(scope, element, attrs) {
            scope.canBeClaimed = function(card) {
                return Cards.cardCanBeClaimed(card);
            };
            scope.belongsToUser = function(card) {
                return Cards.cardBelongsToUser(card);
            };
            scope.getEditMode = function() {
                return Cards.editMode;
            };
            scope.claim = function(key) {
                return Cards.claimCard(key);
            };
            scope.toggleEdit = function(key) {
                scope.editing = !scope.editing;
                return Cards.toggleEditCard(key);
            };
            scope.close = function(key) {
                return Cards.close(key);
            };
            scope.update = function(key, card) {
                Cards.updateCard(key, card.data);
                scope.card.editing = false;
            };
            scope.delete = function(key, card) {
                return Cards.deleteCard(key, card);
            };
            scope.formatOptions = function() {
                return Cards.formatOptions();
            };
            scope.populateFromWikipedia = function(key, card) {
                return Cards.populateFromWikipedia(key, card);
            };
            scope.getAuthor = function(card) {
                return Cards.getCardAuthorDetails(card);
            };
            scope.getCardIdentity = function(card) {
                return Cards.identities[Cards.recordKeyPos('identity', card.data.identity)];
            };
            scope.deleteKeyword = function(key, identityKey) {
                Cards.deleteKeyword(key, identityKey);
            };
            scope.appendKeyword = function(newKeyword, identityKey) {
                Cards.appendKeyword(newKeyword, identityKey);
            };
        }
    };
}]);

app.directive('ngCardFormat', ["$compile", '$http', '$templateCache', '$parse', function($compile, $http, $templateCache, $parse) {
    return {
        restrict: 'E',
        templateUrl: 'html/cards/profile.html',
        scope: {
            data: '=',
            editing: '=',
            format: '&'
        },
        link: function(scope, element, attrs) {

            // scope.editing = attrs.editing;
            // scope.data = attrs.data;

            scope.$watch(scope.format, function(value) {
                if (value) {
                    value = 'html/cards/' + value + '.html';
                    loadTemplate(value);
                }
            });

            function loadTemplate(format) {
                $http.get(format, {
                        cache: $templateCache
                    })
                    .success(function(templateContent) {
                        element.replaceWith($compile(templateContent)(scope));
                    });
            }
        }
    }
}]);




app.directive('ngSearch', ['Cards', function(Cards) {
    return {
        restrict: 'E',
        templateUrl: 'html/components/search.html',
        scope: {
            searchSource: '@source',
            index: '@',
            filter: '@',
            action: '@',
            resultKey: '=',
            format: '@'
        },
        link: function(scope, element, attrs) {
            scope.placeholder = scope.index ? 'Search for ' + scope.index + '...' : 'Search...';
            var initRun = true;

            scope.search = function(query) {
                switch (scope.searchSource) {
                    case 'Algolia':
                        Cards.search(query, initRun).then(function(hits) {
                            scope.hits = hits;
                            initRun = false;
                        });
                        break;
                }
            };
            scope.clickAction = function(key, cardData) {
                /*LOG*/ //console.log(key, cardData);
                scope.query = '';
                scope.hits = [];
                switch (scope.action) {
                    case 'openCard':
                        Cards.openFromCardKey(key, false);
                        break;
                    case 'select':
                        scope.resultKey = cardData.identity;
                        scope.resultTitle = cardData.title;
                        element.find('input').attr("placeholder", scope.resultTitle);
                        break;
                }
            };
            scope.setFocus = function(focussed) {
                if (focussed) {
                    scope.focussed = true;
                } else {
                    setTimeout(function(){ scope.focussed = false; mainScope.$apply(); }, 500); //Sort of a hack
                }
            };
        }
    };
}]);


// app.directive('ngBio', function() {
//     return {
//         restrict: 'E',
//         require: 'MainCtrl',
//         templateUrl: 'html/bio.html'
//     }
// });

// app.directive('ngCardSearch', function() {
//     return {
//         restrict: 'E',
//         require: 'MainCtrl',
//         templateUrl: 'html/card_search.html'
//     }
// });

app.directive('ngStructuredText', ['Cards', function(Cards) {
    return {
        restrict: 'EA',
        // require: 'MainCtrl',
        templateUrl: 'html/components/structured-text.html',
        link: function(scope, element, attrs) {

            // scope.editing = attrs.editing;
            // scope.text = attrs.text;

            scope.openCard = function(key, edit) {
                return Cards.open(key, edit);
            };
        },
        // controller: function($scope, $element) {
        //     $scope.openCard = function(ref) {
        //         cardToOpen = ref;
        //         $scope.openCard();
        //     }
        // },
        scope: {
            editing: '=',
            text: '=',
            label: '@',
            small: '@'
        }
    }
}]);

app.directive('ngList', ['Cards', function(Cards) {
    return {
        restrict: 'EA',
        templateUrl: 'html/components/list.html',
        link: function(scope, element, attrs) {

            scope.addItem = function(key, edit) {
                scope.list.push({text:''});
            };
        },
        scope: {
            editing: '=',
            list: '=',
            label: '@'
        }
    }
}]);


app.directive('ngQuoteAuthor', ['Cards', function(Cards) {
    return {
        restrict: 'E',
        templateUrl: 'html/components/quote-author.html',
        scope: {
            editing: '=',
            quoteAuthorRef: '=author',
            format: '&'
        },
        link: function(scope, element, attrs) {
            scope.openCard = function(key, edit) {
                return Cards.open(key, edit);
            };
            scope.getAuthor = function(key) {
                // return Cards.getAuthorProfile(key);
            };
            scope.getQuoteAuthorOptions = function() {
                return Cards.getQuoteAuthorOptions();
            };
        }
    };
}]);

app.directive('ngImage', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/image.html',
        link: function(scope, elem, attrs) {

        },
        scope: {
            editing: '=',
            image: '=',
            backupImageSrc: '=backup'
        }
    }
});

app.directive('ngText', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/text.html',
        link: function(scope, elem, attrs) {
            scope.isTag = function(myTag) {
                if (myTag == scope.tag) {
                    return true;
                } else {
                    return false;
                }
            }
        },
        scope: {
            editing: '=',
            text: '=',
            label: '@',
            tag: '@'
        }
    }
});

app.directive('ngTitle', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/title.html',
        scope: {
            editing: '=',
            title: '=',
        }
    }
});

app.directive('ngSubtitle', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/subtitle.html',
        scope: {
            editing: '=',
            subtitle: '='
        }
    }
});

app.directive('ngCredits', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/credits.html',
        scope: {
            editing: '=',
            author: '=',
            sources: '='
        }
    }
});

app.directive('ngAuthor', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/author.html',
        scope: {
            editing: '=',
            author: '='
        }
    }
});

app.directive('ngSources', function() {
    return {
        restrict: 'E',
        // require: 'MainCtrl',
        templateUrl: 'html/components/sources.html',
        scope: {
            editing: '=',
            sources: '='
        }
    }
});

app.directive('ngFormat', function() {
    return {
        restrict: 'E',
        require: 'MainCtrl',
        templateUrl: 'html/components/format.html',
        scope: {
            format: '=',
            formatOptions: '=',
            card: '=card',
            editing: '='
        }
    }
});

app.directive('ngEmbed', function() {
    return {
        restrict: 'E',
        require: 'MainCtrl',
        templateUrl: 'html/components/embed.html',
        scope: {
            editing: '=',
            embed: '='
        }
    }
});

app.directive('ngManual', function() {
    return {
        restrict: 'E',
        require: 'MainCtrl',
        templateUrl: 'html/components/manual.html',
        scope: {
            editing: '=',
            html: '='
        }
    }
});








app.filter("sanitize", ['$sce', function($sce) {
    return function(htmlCode) {
        return $sce.trustAsHtml(htmlCode);
    }
}]);





app.factory("Post", function($resource) {
    return $resource("http://demo.ckan.org/api/3/action/package_search");
});