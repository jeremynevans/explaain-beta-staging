// data_handling.js
var exports = module.exports = {};

var Q = require('q');
var Firebase = require('firebase');
var algoliasearch = require('algoliasearch');



//STILL TO SORT/FIX
// - Initial Identity when cloning
// - All action and most data follow ups
// - What should get added to Algolia
// - Checking whether identical records already exists & other tests (e.g. keyword length > 1)
// - Making sure the data is in a good enough format before it's sent to the server (to put it another way, who should sort what out?)
// - Returning promises back to the client after altering records
// - $rootScope.$apply should happen client-side - when?
// - Authentication - should be done backend (each time)?


console.log('hi');




//Data processing

exports.changeRecord = function(data, recordType, changeType, settings) { //This comes straight from the client
    var deferred = Q.defer();
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
}

function changeFirebaseRecord(data, changeType) {
    var deferred = Q.defer();
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
}

function getDefaults(recordType) {
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
}

function setDefaults(myObject, defaults) {
    for (var i in defaults) {
        myObject[defaults[i][0]] = myObject[defaults[i][0]] || defaults[i][1];
    }
    return myObject;
}

function setDefaultFollowUps(recordType, changeType, settings) {
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
}

function cardFormatDefaults(data) {
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
}

function specialRecordHandling(data, recordType, changeType) {
    switch (recordType) {
        case 'card':
            if (changeType=='create') { data = cardFormatDefaults(data); }
            // Temporarily disabled all text sturtcuring while testing
            // data = structureAllCardText(data);
            break;
    }
    return data;
}

function actionFollowUp(data, recordType, followUp) {
    //Need Stuff Here
}

function dataFollowUp(prevData, prevRecordType, followUp) {
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
}

function changeAlgolia(data, recordType, changeType) {
    //Need Stuff Here
}







// Directly copied from Frontend from before - no need to update this yet

function structureAllCardText(cardData) {
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
}

function structureText(identityKey, text, keywords) {
    //console.log((Date.now() - currentTimestamp), currentTimestamp = Date.now(), 'function: structureText', identityKey, text, keywords);
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
}