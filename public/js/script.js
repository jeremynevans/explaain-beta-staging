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

var app = angular.module('app', ['firebase', 'ngMaterial', 'algoliasearch', 'ngRoute', 'ngSanitize', 'ngResource', 'monospaced.elastic']); /* global angular */

app.controller('MainCtrl', ['$scope', '$timeout', '$http', '$mdToast', '$mdSidenav', 'algolia', '$q', 'Cards', 'Post', function($scope, $timeout, $http, $mdToast, $mdSidenav, algolia, $q, Cards, Post) {

    Cards.checkServiceWorks();
    mainScope = $scope;

    Cards.bootUp();

    $scope.cards = Cards.cards;
    $scope.hits = Cards.hits;
    $scope.CardsRef = Cards;


    // Post.query(function(data) {
    //     $scope.posts = data;
    //     console.log(data);
    // });

    // function myFunction() {

    //     $http.jsonp('http://demo.ckan.org/api/3/action/package_search?callback=myFunction1'); /* global $http */

    // }
    // myFunction();

    // function myFunction1(data) {
    //     console.log('data2', data);
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
                'embed'
            ]
        },


        checkServiceWorks: function() {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: checkServiceWorks');
            console.log('Service works!');
        },
        
        bootUp: function() {
            service.serverConnectToServices()
            .then(function(fbInstance) {
                service.fbInstance = fbInstance;
                $('#myModal').modal();
            });
        },
        
        bootUpServices: function(usingTeams) {
            console.log('bootUpServices');
            service.usingTeams = usingTeams;
            service.connectToFirebase(service.fbInstance)
            if (usingTeams) {
                service.logMeIn('twitter')
                .then(service.getThisUserTeam)
                .then(function(team) {
                    console.log('just after team');
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
                    service.importUser(service.loginData.uid);
                    // service.clientAlgolia.copyIndex('cards-template', ALGOLIA_INDEX + '-' + service.thisTeam, function(err, content) {
                    service.bootUpRecords(true);
                    // });
                });
            });
        },
        
        bootUpRecords: function(firstTime) {
            console.log('bootUpRecords');
            service.serverConnectToRecords(service.usingTeams)
            .then(function(algoliaIndex) {
                service.connectToFirebaseRecords(firstTime);
                service.connectToAlgolia();
                service.connectToAlgoliaIndex(algoliaIndex);
                service.reorderKeywords(); //Shouldn't be needed once SetWIthPriority kicks in properly
            });
       },

        connectToFirebase: function(fbInstance) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: connectToFirebase');
            console.log(fbInstance);
            service.firebaseRef = new Firebase(fbInstance);
            service.firebaseUsers = service.firebaseRef.child("users");
            if (service.usingTeams) {
                service.firebaseTeams = service.firebaseRef.child("teams");
            }
        },

        connectToAlgolia: function() { // Needs to be called on page load
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: connectToAlgolia');
            service.clientAlgolia = algoliasearch('RR6V7DE8C8', service.algoliaSearchAPIKey); /* global algoliasearch */
        },
        
        connectToFirebaseRecords: function(firstTime) {
            service.firebaseMain = service.usingTeams ? service.firebaseRef.child("teams/" + service.thisTeam) : service.firebaseRef.child("open");
            service.firebaseCards = service.firebaseMain.child("cards");
            service.firebaseIdentities = service.firebaseMain.child("identities");
            service.firebaseKeywords = service.firebaseMain.child("keywords");
            if (firstTime) {
                service.getInitialIdentity("-K2gZjvQ-Cx2kJvq64Bb")
                .then(function() {
                    return service.cloneAllCards(service.firebaseTeams.child("-K2gZjvQ-Cx2kJvq64Bb/cards"), service.initialIdentity);
                }).then(function() {
                        return service.getInitialIdentity(null);
                }).then(function() {
                    console.log("service.initialIdentity: " + service.initialIdentity);
                    service.updateAllText();
                    service.initialiseFirstCard();
                });
            } else {
                service.getInitialIdentity(null).then(function() {
                    service.initialiseFirstCard();
                });
            }
        },

        connectToAlgoliaIndex: function(algoliaIndex) { // Needs to be called on page load
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: connectToAlgoliaIndex');
            console.log(algoliaIndex);
            service.algoliaIndex = service.clientAlgolia.initIndex(algoliaIndex);
            console.log(service.algoliaIndex);
        },


        search: function(query, initRun) {
            console.log('query', query);
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: initialiseFirstCard');
            console.log('opening first card');
            console.log(initialIdentity);
            console.log('initialiseFirstCard');
            service.open(service.initialIdentity, false);
        },

        removeSpinner: function() {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: removeSpinner');
            if (firstCard) {
                firstCard = false;
                var element = document.getElementById("spinner");
                element.parentNode.removeChild(element);
            }
        },

        cardKeyPos: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cardKeyPos', key);
            var card = service.cardImported(key);
            return service.cards.indexOf(card);
        },

        identityKeyPos: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: identityKeyPos', key);
            var identity = service.identityImported(key);
            return service.identities.indexOf(identity);
        },

        keywordKeyPos: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: keywordKeyPos', key);
            var keyword = service.keywordImported(key);
            return service.keywords.indexOf(keyword);
        },

        userKeyPos: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: userKeyPos', key);
            var user = service.userImported(key);
            return service.users.indexOf(user);
        },

        cardImported: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: cardImported', key);
            console.log('key', key);
            var card = $.grep(service.cards, function(e) {
                return e.objectID == key;
            })[0];
            if (!card) {
                card = null
            };
            return card;
        },

        identityImported: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: identityImported', key);
            var identity = $.grep(service.identities, function(e) {
                return e.objectID == key;
            })[0];
            if (!identity) {
                identity = null
            };
            return identity;
        },

        keywordImported: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: keywordImported', key);
            var keyword = $.grep(service.keywords, function(e) {
                return e.objectID == key;
            })[0];
            return keyword;
        },

        userImported: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: userImported', key);
            var user = $.grep(service.users, function(e) {
                return e.data.uid == key;
            })[0];
            console.log(user);
            return user;
        },
        
        getInitialIdentity: function(team) {
            console.log("team: " + team);
            return $q(function(resolve, reject) {
                var tempFirebaseMain = team ? service.firebaseTeams.child(team) : service.firebaseMain;
                tempFirebaseMain.child("settings").once('value', function(snapshot) {
                    console.log(snapshot.val());
                    service.initialIdentity = snapshot.val().initialIdentity;
                    resolve();
                });
            });
        },

        getCard: function(key, reImport) { // reImport should be false if this is being called constantly
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getCard', key, reImport);
            return $q(function(resolve, reject) {
                var card = service.cardImported(key);
                console.log('card1', card);
                if (card) {
                    console.log('reImport', reImport);
                    if (reImport) {
                        console.log('yep');
                        service.reImportCard(key).then(function() {
                            console.log('service.cards 1');
                            console.log(service.cards);
                            resolve(card);
                        });
                    }
                    else {
                        console.log('nope');
                            console.log('service.cards 2');
                            console.log(service.cards);
                        resolve(card);
                    }
                }
                else {
                    var promise = service.importCard(key);
                    promise.then(function(tempCard) {
                        console.log('tempCard', tempCard);
                        card = tempCard;
                            console.log('service.cards 3');
                            console.log(service.cards);
                        resolve(card);
                    });
                }
            });
        },

        getIdentity: function(key) { //Needs reImport parameter?
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getIdentity', key);
            return $q(function(resolve, reject) {
                var identity = service.identityImported(key);
                if (identity) {
                    resolve(identity);
                }
                else {
                    var promise = service.importIdentity(key);
                    promise.then(function(tempIdentity) {
                        identity = tempIdentity;
                        resolve(identity);
                    });
                }
            });

        },

        getKeyword: function(key) { //Not yet used, and may well not be while all text structuring is done on the front end
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getKeyword', key);
            return $q(function(resolve, reject) {
                var keyword = service.keywordImported(key);
                if (keyword) {
                    resolve(keyword);
                }
                else {
                    var promise = service.importKeyword(key);
                    promise.then(function(tempKeyword) {
                        keyword = tempKeyword;
                        resolve(keyword);
                    });
                }
            });

        },

        getUser: function(key) { //Needs reImport parameter?
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getUser', key);
            return $q(function(resolve, reject) {
                if (!key) {
                    resolve(null);
                }
                else {
                    var user = service.userImported(key);
                    if (user) {
                        resolve(user);
                    }
                    else {
                        var promise = service.importUser(key);
                        promise.then(function(tempUser) {
                            user = tempUser;
                            console.log('user');
                            console.log(user);
                            resolve(user);
                        });
                    }
                }
            });

        },
        
        getThisUserTeam: function() {
            console.log('getThisUserTeam');
            var deferred = $q.defer();
            var key = service.loginData.uid;
            console.log(key);
            service.getUserTeam(key).then(function(team) {
                console.log(team);
                deferred.resolve(team);
            });
            return deferred.promise;
        },
        
        getUserTeam: function(key) {
            var deferred = $q.defer();
            service.getUser(key).then(function(user) {
                var team = user.data.teams ? user.data.teams[0] : null;
                deferred.resolve(team);
            });
            return deferred.promise;
        },

        importCard: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importCard', key);
            return $q(function(resolve, reject) {
                service.firebaseCards.child(key).once('value', function(snapshot) {
                        console.log(snapshot.val());
                        var newCard = {
                            data: snapshot.val(),
                            objectID: snapshot.key(),
                            editing: false,
                            atFront: false,
                            showing: false,
                        };

                        service.getIdentity(newCard.data.identity).then(function() {
                            service.getUser(newCard.data.authorId).then(function(user) {
                                // newCard.author = user;
                                console.log('user: ', user);
                                var foundCard = service.cardImported(key); //This checks again at the last minute - is this really the most efficient way of doing it?
                                console.log('foundCard test: ' + key);
                                console.log(foundCard);
                                service.removeSpinner();
                                if (!foundCard) {
                                    var length = service.cards.push(newCard);
                                    resolve(service.cards[length - 1]);
                                } else {
                                    resolve(foundCard);
                                }
                            });
                        });

                    },
                    function(error) {
                        reject(-1);
                    });
            });
        },

        importIdentity: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importIdentity', key);
            return $q(function(resolve, reject) {
                service.firebaseIdentities.child(key).once('value', function(snapshot) {
                    service.getIdentityKeywords(key).then(function(keywordsTemp) {
                        var newIdentity = {
                            data: snapshot.val(),
                            objectID: snapshot.key(),
                            keywords: keywordsTemp
                        };
                        var foundIdentity = service.identityImported(key); //This checks again at the last minute - is this really the most efficient way of doing it?
                        console.log('foundIdentity test: ' + key);
                        console.log(foundIdentity);
                        if (!foundIdentity) {
                            var length = service.identities.push(newIdentity);
                            resolve(service.identities[length - 1]);
                        } else {
                            resolve(foundIdentity);
                        }
                    })
                }, function(error) {
                    reject(-1);
                });
            });
        },

        importKeyword: function(key) { //Not yet used, and may well not be while all text structuring is done on the front end
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importKeyword', key);
            return $q(function(resolve, reject) {
                service.firebaseKeywords.child(key).once('value', function(snapshot) {

                    var newKeyword = {
                        data: snapshot.val(),
                        objectID: snapshot.key()
                    };

                    var length = service.keywords.push(newKeyword);
                    resolve(service.keywords[length - 1]);

                }, function(error) {
                    reject(-1);
                });
            });

        },

        importUser: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: importUser', key);
            return $q(function(resolve, reject) {
                service.firebaseUsers.child(key).once('value', function(snapshot) {

                    var newUser = {
                        data: snapshot.val()
                    };

                    var length = service.users.push(newUser);
                    resolve(service.users[length - 1]);

                }, function(error) {
                    reject(-1);
                });
            });
        },

        reImportCard: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reImportCard', key);
            return $q(function(resolve, reject) {
                service.firebaseCards.child(key).once('value', function(snapshot) {
                    service.cards[service.cardKeyPos(key)].data = snapshot.val();
                    resolve(service.cards[service.cardKeyPos(key)]);

                }, function(error) {
                    reject(-1);
                });
            });
        },
        
        cloneAllCards: function(cardSet, initialIdentity) {
            return $q(function(resolve, reject) {
                cardSet.on('child_added', function(snapshot) {
                    console.log(initialIdentity);
                    console.log(snapshot.val().identity);
                    if (snapshot.val().identity == initialIdentity) {
                        var thisIsInitial = true;
                        console.log('the one');
                    }
                    service.cloneCard(snapshot.val(), thisIsInitial).then(function() {
                        if (thisIsInitial) {
                            console.log('resolving');
                            resolve();
                        }
                    });
                });
            });
            
            //-----------Still haven't figured out how to do this....
            // return $q.all(myPromises).then(function() {
            //     console.log('resolving');
            // });
        },
        
        cloneCard: function(originalCardData, thisIsInitial) {
            return $q(function(resolve, reject) {
                originalCardData.objectID = null;
                originalCardData.dateCreated = Date.now();
                originalCardData.identity = null;
                var newCardData = originalCardData;
                var newCard = service.firebaseCards.push();
                var key = newCard.key();
                newCardData.objectID = key;
                newCard.set(newCardData, function(error) {
                    console.log(newCardData);
                    service.addNewIdentity(key, newCardData.title, thisIsInitial);
                    service.algoliaAdd(newCardData, key); // This needs to use callbacks etc
                    resolve();
                });
            });
        },

        addNewCard: function(cardData, format, open, autoPopulate, edit) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewCard', cardData, open, autoPopulate, edit);
            //This needs to be passed into the function, not created here
            var identityKey = undefined;


            cardData.dateCreated = Date.now();
            cardData.authorId = service.loginData.uid || null;
            cardData.sources = [];

            cardData.format = format; //prompt("What format should the new card take?", "profile");

            if (cardData.format === undefined) {
                cardData.format = 'profile';
            }
            if (cardData.title === undefined) {
                cardData.title = '';
            }
            if (cardData.bio === undefined) {
                cardData.bio = {
                    value: '',
                    structure: []
                };
            }
            
            if (format=="list") { //Need to do all this properly
                cardData.intro = {value: ''};
                cardData.list = [{value: ''}];
                cardData.outro = {value: ''};
            }
            
            cardData = service.structureAllText(cardData);
            
            cardData.id = cardData.title.replace(" ", "-").toLowerCase();
            console.log('cardData', cardData);
            var newCard = service.firebaseCards.push();
            var key = newCard.key();
            cardData.objectID = key;
            newCard.set(cardData, function(error) {
                console.log('now set');
                // if (cardData.title.length > 0) {
                //     $scope.showSimpleToast("Success! You've added a new card called " + card.data.title);
                // }
                // else {
                //     $scope.showSimpleToast("Success! You've added a new card.");
                // }
                console.log('edit:', edit);
                if (identityKey === undefined) { //$scope.addNewIdentity will sort the opening
                    service.addNewIdentity(key, cardData.title).then(function(identityKey) {
                        open ? service.open(identityKey, edit) : null;
                    });
                }
                else {
                    open ? service.open(identityKey, edit) : null;
                }

                service.algoliaAdd(cardData, key); // This needs to use callbacks etc
            });
        },

        addNewIdentity: function(initialCardKey, initialKeyword, thisIsInitial) { //Only call this function once the card has been created
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewIdentity', initialCardKey, initialKeyword);
            return $q(function(resolve, reject) {
                var newIdentity = service.firebaseIdentities.push();
                var identityKey = newIdentity.key();
                newIdentity.set({
                    cards: [{
                        key: initialCardKey,
                        rank: 0
                    }]
                }, function(error) {
                    var initialCard = service.firebaseCards.child(initialCardKey);
                    initialCard.update({
                        identity: identityKey
                    }, function(error) {
                        service.getCard(initialCardKey, true)
                            .then(function() {
                                if (initialKeyword.length > 0) {
                                    var newkeywordData = {
                                        keyword: initialKeyword,
                                        identityRef: identityKey
                                    };
                                    service.addNewKeyword(newkeywordData, false).then(function() {
                                        resolve(identityKey);
                                    });
                                }
                                else {
                                    resolve(identityKey);
                                }
                            });
                    });
                });
                if (thisIsInitial) {
                    service.firebaseMain.child("settings").update({initialIdentity: identityKey}, function() {
                        console.log(identityKey);
                    });
                }
                

                // function afterNewIdentity() {

                // }
            });
        },

        appendKeyword: function(keyword, identityKey) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: appendKeyword', keyword, identityKey);
            var newKeywordData = {
                keyword: keyword,
                identityRef: identityKey
            };
            service.addNewKeyword(newKeywordData, true).then(function(newKeywordDataTemp, key) {
                var newKeyword = {
                    data: newKeywordDataTemp,
                    objectID: key
                };
                // service.identities[service.identityKeyPos(identityKey)].keywords.push(newKeyword); //Not sure why this isn't needed
            });
            return newKeywordData;
        },

        addNewKeyword: function(newkeyword, showToast) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewKeyword', newkeyword, showToast);
            return $q(function(resolve, reject) {
                service.firebaseKeywords.orderByChild("keyword").equalTo(newkeyword.keyword).once('value', function(snapshot) {
                    if (snapshot.val() !== null) {
                        console.log('keyword with same string already exists');
                        reject();
                    }
                    else {
                        if (newkeyword.keyword.length < 1) {
                            reject();
                        }
                        newkeyword.keywordLength = newkeyword.keyword.length * -1;
                        var newKeyword = service.firebaseKeywords.push();
                        var key = newKeyword.key()
                        newKeyword.setWithPriority(newkeyword, newkeyword.keywordLength, function(error) { //Need to retrospectively set priorities for existing keywords (one time only)
                            newkeyword.keyword.length ? service.updateBiosFromKeyword(newkeyword.keyword) : null; //Maybe this should be calling back too
                            // if (showToast) {
                            //     $scope.showSimpleToast("Success! You've added the keyword \"" + newkeyword.keyword + "\"");
                            // }
                            resolve(newKeyword, key);
                        });
                    }
                });
            });
        },

        updateCard: function(key, card) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateCard', key, card);
            
            var cardData = card.data;
            cardData = service.structureAllText(cardData);
            
            card = angular.fromJson(angular.toJson(card)); // This removes $$hashKey etc so Firebase accepts it
            // var identity = service.identities[service.identityKeyPos(card.data.identity)];
            // var hasKeyword = $.grep(identity.keywords, function(e) {
            //     return e.data.identityRef == identity.data.objectID;
            // });
            // if (hasKeyword.length == 0) {
            service.appendKeyword(card.data.title, card.data.identity);
            // }

            console.log('about to update:', card);
            service.firebaseCards.child(key).update(card.data, function(error) {
                service.algoliaUpdate(key, card); // This needs to use callbacks etc
                service.reImportCard(key); // Is this necessary?
                card.editing ? service.toggleEditCard(key) : null;

                $rootScope.$apply(); //Looks like this might be needed in other places too - maybe an Angula $watch function on service.cards?

                // service.showSimpleToast("Success! You've updated the card " + card.data.title); //Shouldn't really display this until algoliaUpdate and reImportCard are complete
            });
        },

        deleteCard: function(key, card) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteCard', key, card);
            var title = card.data.title ? card.data.title : null;
            var identityKey = card.data.identity;

            service.firebaseCards.child(key).remove(function() {
                service.cards.splice(service.cardKeyPos(key), 1);
                service.deleteIdentity(identityKey, title); //Needs to only be if the identity has no more cards left
                service.algoliaDelete(key); // This needs to use callbacks etc

                $rootScope.$apply(); //Looks like this might be needed in other places too - maybe an Angula $watch function on service.cards?

                //The following should really only happen after various callbacks
                // $scope.showSimpleToast("Success! You've deleted the card " + title);
            });
        },

        deleteIdentity: function(identityKey, title) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteIdentity', identityKey, title);
            //What happens to any of the identity's remaining cards?

            service.firebaseIdentities.child(identityKey).remove(function() {
                service.identities.splice(service.identityKeyPos(identityKey), 1);
                // $scope.algoliaDelete(key); //Need to add Identities to Algolia and work out what we can do with them
                service.deleteIdentityKeywords(identityKey);
                // service.showSimpleToast("Success! You've deleted the identity " + title);
            });
        },

        deleteKeyword: function(key, identityKey, keywordText) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteKeyword', key, identityKey);
            var identityKeyPos = service.identityKeyPos(identityKey);
            var identity = service.identities[identityKeyPos];
            var identityKeywords = identity ? identity.keywords : null;
            service.firebaseKeywords.child(key).remove(function() {
                identityKeywords ? service.identities[identityKeyPos].keywords = $.grep(identityKeywords, function(e) {
                    return e.objectID != key;
                }) : null;
                service.reorderKeywords().then(function() {
                    service.updateBiosFromKeyword(keywordText);
                    // $rootScope.$apply();
                });
            });
        },

        getIdentityKeywords: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getIdentityKeywords', key);
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getCardFromIdentity', identity);
            var cardKey = identity.data.cards[0].key; //Currently just selects the first card in the identity's 'cards' array
            return cardKey;
        },

        getCardAuthorDetails: function(card) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getCardAuthorDetails', card);
            var authorId = card.data.authorId;
            console.log(authorId);
            console.log(service.userKeyPos(authorId));
            var author = service.users[service.userKeyPos(authorId)]; // This assumes user has already been imported - should we use getAuthor instead?
            return author;
        },

        getAuthorProfile: function(key) { // This assumes identity has already been imported - need to make sure this happens first
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getAuthorProfile', key);

            key ? service.getIdentity(key) : null;

            var identityPos = key ? service.identityKeyPos(key) : null;
            var identity = identityPos != -1 ? service.identities[identityPos] : null;
            console.log('identity', identity);

            if (identity) {
                identity.data ? service.getCard(service.getCardFromIdentity(identity)) : null;
            }

            var cardPos = identity ? service.cardKeyPos(service.getCardFromIdentity(identity)) : null;
            var card = cardPos != -1 ? service.cards[cardPos] : null;
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getQuoteAuthorOptions');
            return service.cards;
        },

        getLinksfromText: function(structure) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: getLinksfromText', structure);
            var textLinks = [];
            for (var i = 0; i < structure.length; i++) {
                if (structure[i].type == 'link' & textLinks.indexOf(structure[i].ref) == -1) {
                    textLinks.push(structure[i].ref);
                }
            }
            return textLinks;
        },

        moveCardToFront: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: moveCardToFront', key);
            console.log('moving');
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: openFromCardKey', cardKey, edit);
            service.getCard(cardKey, true).then(function(card) {
                console.log(card);
                service.open(card.data.identity, edit);
            });
        },

        open: function(identityKey, edit) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: open', identityKey, edit);
            console.log('layer1');
            service.getIdentity(identityKey).then(function(identity) {
                console.log('layer2');
                var cardKey = service.getCardFromIdentity(identity);
                service.getCard(cardKey, true).then(function(card) {
                    console.log('layer3');
                    service.moveCardToFront(card.objectID);
                    console.log('edit:', edit);
                    console.log('card.editing:', card.editing);
                    console.log('logic:', edit && !card.editing);
                    edit && !card.editing ? service.toggleEditCard(cardKey) : null;
                    
                    
                    setTimeout(function(){
                        $(function () {
                          $('[data-toggle="tooltip"]').tooltip()
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
            });
        },

        close: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: close', key);
            var pos = service.cardKeyPos(key);
            console.log(pos);
            if (pos != undefined) {
                service.cards[pos].showing = false;
                service.cards[pos].atFront = false;
            }
            console.log('service.cards[pos]', service.cards[pos]);
        },

        toggleEditMode: function() {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: toggleEditMode');
            console.log('toggling edit mode 2');
            service.editMode = !service.editMode;
            // if (editMode) {
            //     $scope.showSimpleToast("Edit mode is on");
            // }
            // else {
            //     $scope.showSimpleToast("Edit mode is off");
            // }
        },

        toggleEditCard: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: toggleEditCard', key);
            var pos = service.cardKeyPos(key);
            service.cards[pos].editing = !service.cards[pos].editing;
        },

        populateFromWikipedia: function(key, cardData) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: populateFromWikipedia', key, cardData);
            var title = cardData.title;
            $http.jsonp('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&lllimit=500&titles=' + title + '&callback=JSON_CALLBACK&formatversion=2'). /* global $http */
            success(function(data) {
                console.log('success1', data);
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
                console.log('cardData', cardData);
                $http.jsonp('https://en.wikipedia.org/w/api.php?&format=json&&callback=JSON_CALLBACK&formatversion=2&action=query&titles=' + title + '&prop=pageimages&format=json&pithumbsize=200').
                success(function(data) {
                    console.log('success2', data);
                    if (cardData.image === undefined) {
                        cardData.image = {};
                    }
                    cardData.image.value = data.query.pages[0].thumbnail.source;
                    console.log('cardData', cardData);
                    service.cards[service.cardKeyPos(key)].data = cardData; //Pretty sure this won't work now we're inside a service!
                });
            });
        },

        htmlToPlaintext: function(text) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: htmlToPlaintext', text);
            var text1 = String(text).replace(/<[^>]+>.<[^>]+>|\s\s+/gm, ' ').replace(/<[^>]+>|\;|\(.*\) |\(.*\)/gm, '').replace(/<[^>]+>.<[^>]+>|\s\s+/gm, ' ').replace('( ', '(');
            return text1.replace('&crarr;', ' ');
        },

        nSentencesMChars: function(text, n, m) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: nSentencesMChars', text, n, m);
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
        
        structureAllText: function(cardData) {
          if (cardData.textStructures) {
                for (i=0; i < cardData.textStructures.length; i++) {
                    console.log(cardData.textStructures[i]);
                    console.log(cardData[cardData.textStructures[i]]);
                    if (cardData[cardData.textStructures[i]][0]) { //This handles lists but not yet 2-dimensional arrays (e.g. for tables)
                        for (j=0; j < cardData[cardData.textStructures[i]].length; j++) {
                            console.log(cardData[cardData.textStructures[i]][j]);
                            cardData[cardData.textStructures[i]][j].structure = [];
                            cardData[cardData.textStructures[i]][j].structure = service.structureText(-1, cardData[cardData.textStructures[i]][j].value, service.orderedKeywords);
                        }
                    } else {
                        cardData[cardData.textStructures[i]].structure = [];
                        cardData[cardData.textStructures[i]].structure = service.structureText(-1, cardData[cardData.textStructures[i]].value, service.orderedKeywords);
                    }
                }
            } else {
                cardData.bio.structure = [];
                cardData.bio.structure = service.structureText(-1, cardData.bio.value, service.orderedKeywords);
            }
            
            return cardData;
        },

        structureText: function(identityKey, text, keywords) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: structureText', identityKey, text, keywords);
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: deleteIdentityKeywords', key);
            service.firebaseKeywords.orderByChild("identityRef").equalTo(key).on("child_added", function(snapshot) {
                service.deleteKeyword(snapshot.key(), key, snapshot.val().keyword);
            });
        },

        reorderKeywords: function() { //Should render this unecessary by using Firebase's ordered lists with keywordLength as the ordering key
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reorderKeywords');
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

        updateBiosFromKeyword: function(keywordText) {
            //This should update all types of structured text, not just bios
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateBiosFromKeyword', keywordText);
            //Should this use Algolia to search through bios?
            //Slightly updated now we have localCards, but still not quite right
            service.reorderKeywords().then(function() {
                service.firebaseCards.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
                    var key = snapshot.key();
                    var bio = snapshot.val().bio.value;
                    if (bio.indexOf(keywordText) != -1) {
                        var structuredBio = service.structureText(snapshot.val().identity, bio, service.orderedKeywords);
                        service.firebaseCards.child(key).child('bio').child('structure').set(structuredBio);
                        if (service.cardImported(key)) {
                            service.reImportCard(key);
                        }
                    }
                });
            });
        },

        updateAllText: function() {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllText');
            //Copied and adjusted from updateBiosFromKeyword()
            //Should this use Algolia to search through bios?
            //Slightly updated now we have localCards, but still not quite right
            service.reorderKeywords().then(function() {
                service.firebaseCards.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
                    var key = snapshot.key();
                    console.log(snapshot.val());
                    var bio = snapshot.val().bio.value;
                    var cardData = service.structureAllText(snapshot.val());
                    service.firebaseCards.child(key).set(cardData);
                    if (service.cardImported(key)) {
                        service.reImportCard(key);
                    }
                });
            });
        },


        /* THe following updateAll... functions haven't been properly cleaned up as a lot of it is (hopefully) temporary anyway */

        updateAllIdentities: function() {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllIdentities');
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
                        // service.deleteIdentity(snapshot.key(), snapshot.val());
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllCards');
            service.reorderKeywords(); //Need a callback here to finish this before proceeding

            service.firebaseCards.on('child_added', function(snapshot) { //Should this be once() not on() to stop it continuing to do it?
                var key = snapshot.key();
                // if (!snapshot.val().title) {
                //     console.log('need to remove this card2: ', snapshot.val());
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateAllKeywords');
            service.firebaseKeywords.on('child_added', function(snapshot) {
                var tempKeywordLength = snapshot.val().keywordLength;
                // console.log('tempKeywordLength', tempKeywordLength);
                snapshot.ref().setPriority(tempKeywordLength);
                // console.log(snapshot.val().identityRef);
                service.firebaseIdentities.child(snapshot.val().identityRef).once('value', function(identitySnapshot) {
                    // console.log(snapshot.val().identityRef);
                    // console.log(identitySnapshot.val());
                }, function(error) {
                    service.firebaseKeywords.child(snapshot.key()).remove(function() { //Don't yet know whether this actually works!
                        // console.log("Keyword " + snapshot.val().keyword + " removed.");
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: updateEverything');
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: toggleLogin');
            if (service.loggedIn) {
                service.firebaseRef.unAuth(); //Doesn't currently work for some reason
            }
            else {
                service.logMeIn('twitter');
            }
        },

        logMeIn: function(loginProvider) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: logMeIn', loginProvider);
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

                                console.log(authData);
                    
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
                                        service.importUser(authData.uid)
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: allowingEditMode');
            if (service.loggedIn | service.godMode) {
                return true;
            }
            else {
                return false;
            }
        },

        cardBelongsToUser: function(card) {
            // console.log((Date.now() - currentTimestamp),currentTimestamp = Date.now(), 'function: cardBelongsToUser', card);
            if ( service.loggedIn && (card.data.authorId == service.loginData.uid) | service.godMode) {
                return true;
            }
            else {
                return false;
            }
        },

        cardCanBeClaimed: function(card) {
            // console.log((Date.now() - currentTimestamp),currentTimestamp = Date.now(), 'function: cardCanBeClaimed', card);
            if (service.loggedIn & card.data.authorId == undefined & !service.godMode) {
                return true;
            }
            else {
                return false;
            }
        },

        claimCard: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: claimCard', key);
            if (service.loggedIn) {
                service.firebaseCards.child(key).update({
                    authorId: service.loginData.uid
                }, function(error) {
                    service.reImportCard(key).then(function() {
                        
                        // $rootScope.$apply();
                    });
                    console.log('Error claiming card - trying a reImport.')
                });
            }
        },

        algoliaAdd: function(card, key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: algoliaAdd', card, key);
            console.log(card);
            var myObjectID = key;
            // service.algoliaIndex.addObject(card.data, myObjectID, function(err, content) {


            // });
        },

        algoliaUpdate: function(key, card) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: algoliaUpdate', key, card);


            card.data.objectID = key;
            card.$$conf = null; //Probably not necessary to delete all of this (only to prevent "TypeError: Converting circular structure to JSON" error)
            // service.algoliaIndex.saveObject(card.data, function(err, content) {

             
            // });
        },

        algoliaDelete: function(key) {
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: algoliaDelete', key);
            // service.algoliaIndex.deleteObject(key, function(error) {
            //     if (!error) {

            //     }
            // });
        },





        reImportToAlgolia: function() { //Use this VERY RARELY!!!!!
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: reImportToAlgolia');
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
                    console.log(receivedData);
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
        
        
        
        // NEW doing new data manipulation here instead of server
        
        changeRecord: function(data, recordType, changeType, settings) { //This comes straight from the client
            var deferred = $q.defer();
            //Should check here whether it already exists & other tests (e.g. keyword length > 1)
            changeType=='create' ? data = setDefaults(data, getDefaults(recordType)) : null ;
            settings = setDefaultFollowUps(recordType, changeType, settings);
            data = specialRecordHandling(data, recordType, changeType);
            
            console.log(changeType);
            console.log(settings);
            console.log(data);
            
            // connectToFirebase()
            changeFirebaseRecord(data, changeType)
            .then( function() { //This assumes none of these need to wait for any of the others
                if (changeType=='create') { data.objectID = record.key(); }
                // actionFollowUp(data, recordType, settings.followUp.action);
                // dataFollowUp(data, recordType, settings.followUp.data);
                changeAlgolia(data, recordType, changeType);
                deferred.resolve(data);
                });
            return deferred.promise;
        },
        
        changeFirebaseRecord: function(data, changeType) {
            var deferred = $q.defer();
            switch (changeType) {
                case 'create':
                    var record = theseFirebaseRecords.push();
                    record.objectID = record.key(); //Seems like this shouldn't work but it's what we had in the frontend before
                    record.set(record, onFirebaseChange(error));
                    break;
                case 'update':
                    theseFirebaseRecords.child(data.objectID).update(data, onFirebaseChange(error));
                    break;
                case 'delete':
                    theseFirebaseRecords.child(data.objectID).remove(data, onFirebaseChange(error));
                    break;
            }
            function onFirebaseChange(error) {
                if(error) {
                    deferred.reject();
                } else {
                    deferred.resolve(record.key());
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
                    data = setDefaults(data, [
                        ['bio', {value: ''}]
                    ]);
                    break;
                case 'list':
                    data = setDefaults(data, [
                        [ 'intro', {value: ''} ],
                        [ 'list', [{value: ''}] ],
                        [ 'outro', {value: ''} ]
                    ]);
                    break;
            }
            return data;
        },
        
        specialRecordHandling: function(data, recordType, changeType) {
            switch (recordType) {
                case 'card':
                    if (changeType=='create') { data = cardFormatDefaults(data); }
                    // Temporarily disabled all text sturtcuring while testing
                    // data = structureAllCardText(data);
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
            console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: addNewCard', cardData, open, autoPopulate, edit);
            
            cardData.authorId = service.loginData.uid || null;
            
            if (format=="list") { //Need to do all this properly
                cardData.intro = {value: ''};
                cardData.list = [{value: ''}];
                cardData.outro = {value: ''};
            }
            
            service.serverChangeRecord(cardData, 'card', 'create', {})
            .then(function(receivedData) {
                console.log(receivedData);
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
                console.log('toggling: ', key);
                return Cards.toggleEditCard(key);
            };
            scope.close = function(key) {
                console.log('closing', key);
                return Cards.close(key);
            };
            scope.update = function(key, card) {
                return Cards.updateCard(key, card);
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
                return Cards.identities[Cards.identityKeyPos(card.data.identity)];
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
                console.log('attrs:', attrs);
                console.log('scope:', scope);
                console.log('watched:', value);
                if (value) {
                    value = 'html/cards/' + value + '.html';
                    console.log('template');
                    loadTemplate(value);
                }
            });

            function loadTemplate(format) {
                console.log('format:', format);
                $http.get(format, {
                        cache: $templateCache
                    })
                    .success(function(templateContent) {
                        console.log('templateContent:', templateContent);
                        element.replaceWith($compile(templateContent)(scope));
                        console.log('replaced');
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
                console.log(key, cardData);
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
                return Cards.getAuthorProfile(key);
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








app.filter("sanitize", ['$sce', function($sce) {
    return function(htmlCode) {
        return $sce.trustAsHtml(htmlCode);
    }
}]);





app.factory("Post", function($resource) {
    return $resource("http://demo.ckan.org/api/3/action/package_search");
});