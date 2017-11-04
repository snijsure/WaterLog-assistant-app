const sinon = require('sinon');
const chai = require('chai');

const TimeManager = require('../time-manager');
const firebase = require('firebase');
const geoTz = require('geo-tz');
const moment = require('moment-timezone');
const UserManager = require('../user-manager');
const functions = require('firebase-functions');

describe('TimeManager', () => {
    let timeManagerInstance;
    let userManagerInstance;

    before(() => {
        userManagerInstance = new UserManager();
        timeManagerInstance = new TimeManager(firebase, geoTz, moment, userManagerInstance);

        sinon.stub(userManagerInstance, 'ensureAuthUser').returns(Promise.resolve(true));
    });

    afterEach(() => {
    });

    describe('getPlatformTime', () => {
        const expectedTimezone = 'Europe/Paris';
        const expectedTime = '13:37';

        it('Should return platform time', (done) => {
            const formatStub = sinon.stub().withArgs('h:mm a').returns(expectedTime);
            const guessStub = sinon.stub().returns(expectedTimezone);
            const momentStub = sinon.stub(moment, 'tz');
            momentStub.returns({guess: guessStub});
            momentStub.withArgs(expectedTimezone).returns({format: formatStub});

            timeManagerInstance.getPlatformTime().then(platformTime => {
                chai.assert.equal(platformTime, expectedTime);
                done();

                momentStub.restore();
            });
        });
    });

    describe('getTimeZoneFromCoordinates', () => {
        const coords = {latitude: 37.4265994, longitude: -122.08058050000001}
        const expectedTimezone = 'America/Los_Angeles';

        it('Should convert coordinates to timezone', (done) => {
            const tzStub = sinon.stub(geoTz, 'tz').withArgs(coords.latitude, coords.longitude).returns(expectedTimezone);
            const timezone = timeManagerInstance.getTimeZoneFromCoordinates(coords);
            chai.assert.equal(timezone, expectedTimezone);
            done();

            tzStub.restore();
        });
    });

    describe('saveAssistantUserTimezone', () => {
        const expectedUserId = 'abc123';
        const expectedTimezone = 'Europe/Paris';

        it('Should save assistant user timezone into DB', (done) => {
            const setSpy = sinon.spy();
            const refStub = sinon.stub().withArgs('userTime/' + expectedUserId).returns({set: setSpy});
            const databaseStub = sinon.stub(firebase, 'database').returns({ref: refStub});

            timeManagerInstance.saveAssistantUserTimezone(expectedUserId, expectedTimezone).then(() => {
                chai.assert(setSpy.calledWith({timezone: expectedTimezone}));
                done();

                databaseStub.restore();
            });
        });
    });

    describe('getAssistantUserTimeData', () => {
        const expectedUserTimeData = {timezone: 'America/New_York'};
        const expectedUserId = 'abc123';

        it('Should return local user time if exists', (done) => {
            const dataTimezoneExists = new functions.database.DeltaSnapshot(null, null, null, expectedUserTimeData);
            const fakeEvent = {data: dataTimezoneExists};
            const onceStub = sinon.stub().withArgs('value').returns(Promise.resolve(fakeEvent.data));
            const refStub = sinon.stub().withArgs('userTime/' + expectedUserId).returns({once: onceStub});
            const databaseStub = sinon.stub(firebase, 'database').returns({ref: refStub});

            timeManagerInstance.getAssistantUserTimeData(expectedUserId).then(userTimeData => {
                chai.assert.deepEqual(userTimeData, expectedUserTimeData);
                done();

                databaseStub.restore();
            });
        });
    });

    describe('getTodayStartTimestampForAssistantUser', () => {
        const expectedPlatformTimezone = 'Europe/Paris';
        const expectedUserTimeData = {timezone: 'America/New_York'};
        const expectedPlatformTime = '13:37';
        const expectedUserTime = '8:37';
        const expectedUserId = 'abc123';

        const expectedDate = new Date('2017-11-04T04:00:00.000Z');

        it('Should return date for start of the day for user timezone if exists', (done) => {
            const dataTimezoneExists = new functions.database.DeltaSnapshot(null, null, null, expectedUserTimeData);
            const fakeEvent = {data: dataTimezoneExists};
            const onceStub = sinon.stub().withArgs('value').returns(Promise.resolve(fakeEvent.data));
            const refStub = sinon.stub().withArgs('userTime/' + expectedUserId).returns({once: onceStub});
            const databaseStub = sinon.stub(firebase, 'database').returns({ref: refStub});

            const toDateStub = sinon.stub().returns(expectedDate);
            const startOfStub = sinon.stub().withArgs('day').returns({toDate: toDateStub});
            const tzStub = sinon.stub(moment, 'tz');
            tzStub.withArgs(expectedUserTimeData.timezone).returns({startOf: startOfStub});

            timeManagerInstance.getTodayStartTimestampForAssistantUser(expectedUserId).then(userTimeData => {
                chai.assert.equal(userTimeData, expectedDate);
                done();

                databaseStub.restore();
                tzStub.restore();
            });
        });

        it('Should return start of the day date for platform when user timezone doesnt exist', (done) => {
            const dataTimezoneNotExists = new functions.database.DeltaSnapshot(null, null, null, null);
            const fakeEvent = {data: dataTimezoneNotExists};
            const onceStub = sinon.stub().withArgs('value').returns(Promise.resolve(fakeEvent.data));
            const refStub = sinon.stub().withArgs('userTime/' + expectedUserId).returns({once: onceStub});
            const databaseStub = sinon.stub(firebase, 'database').returns({ref: refStub});

            const toDateStub = sinon.stub().returns(expectedDate);
            const startOfStub = sinon.stub().withArgs('day').returns({toDate: toDateStub});
            const guessStub = sinon.stub().returns(expectedPlatformTimezone);
            const tzStub = sinon.stub(moment, 'tz');
            tzStub.withArgs(expectedPlatformTimezone).returns({startOf: startOfStub});
            tzStub.returns({guess: guessStub});

            timeManagerInstance.getTodayStartTimestampForAssistantUser(expectedUserId).then(userTimeData => {
                chai.assert.equal(userTimeData, expectedDate);
                done();

                databaseStub.restore();
                tzStub.restore();
            });
        });
    });
});