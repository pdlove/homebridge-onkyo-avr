var inherits = require('util').inherits;
var Service;
var Characteristic;
var request = require("request");
var pollingtoevent = require('polling-to-event');
var util = require('util');
var VolumeCharacteristic;
module.exports = function(homebridge)
{
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  VolumeCharacteristic = function() {
    Characteristic.call(this, 'Volume', '91288267-5678-49B2-8D22-F57BE995AA93');
    this.setProps({
      format: Characteristic.Formats.INT,
      unit: Characteristic.Units.PERCENTAGE,
      maxValue: 100,
      minValue: 0,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
    });
    this.value = this.getDefaultValue();
  };
  inherits(VolumeCharacteristic, Characteristic);
  homebridge.registerAccessory("homebridge-onkyo-avr", "OnkyoAVR", HttpStatusAccessory);
}

/*
exports.init = function(log, config)
{
	return new HttpStatusAccessory(log, config);
}*/

function HttpStatusAccessory(log, config) 
{
	this.log = log;
	var that = this;
	this.eiscp = require('eiscp');

	// config
	this.ip_address	= config["ip_address"];
	this.name = config["name"];
	this.model = config["model"];
	this.poll_status_interval = config["poll_status_interval"] || "0";
		
	this.state = false;
	this.interval = parseInt( this.poll_status_interval);
	this.avrManufacturer = "Onkyo";
	this.avrSerial = "unknown";
	
	this.switchHandling = "check";
	if (this.interval > 10 && this.interval < 100000) {
		this.switchHandling = "poll";
	}
	
	this.eiscp.on('debug', this.eventDebug.bind(this));
	this.eiscp.on('error', this.eventError.bind(this));
	this.eiscp.on('connect', this.eventConnect.bind(this));
	this.eiscp.on('connect', this.eventConnect.bind(this));
	this.eiscp.on('system-power', this.eventSystemPower.bind(this));
	this.eiscp.on('volume', this.eventVolume.bind(this));
	this.eiscp.on('close', this.eventClose.bind(this));
	
	this.eiscp.connect(
		{host: this.ip_address, reconnect: true, model: this.model}
	);

	
	//that.log("hello - "+config["ip_address"]);
	// Status Polling
	if (this.switchHandling == "poll") {
		var powerurl = this.status_url;
		that.log("start long poller..");
		
		var statusemitter = pollingtoevent(function(done) {
			//that.log("Polling");
			that.getPowerState( function( error, response) {
				done(error, response);
			}, "statuspoll");
			that.getVolume( function( error, response) {
				done(error, response);
			}, "statuspoll");
		}, {longpolling:true,interval:that.interval * 1000,longpollEventName:"statuspoll"});

		statusemitter.on("statuspoll", function(data) {
			that.state = data;
			that.log("Poller - State data changed message received: ", that.state);
			if (that.switchService ) {
				that.switchService.getCharacteristic(Characteristic.On).setValue(that.state, null, "statuspoll");
			}
		});
	}
}

HttpStatusAccessory.prototype = {

eventDebug: function( response)
{
	//this.log( "eventDebug: %s", response);
},

eventError: function( response)
{
	this.log( "eventError: %s", error, response);
},

eventConnect: function( response)
{
	this.log.debug( "eventConnect: %s", response);
},

eventSystemPower: function( response)
{
	//this.log( "eventSystemPower: %s", response);
	this.state = (response == "on");
	this.log.debug("Event - Power message received: ", this.state);
	//Communicate status
	if (this.switchService ) {
		this.switchService.getCharacteristic(Characteristic.On).setValue(this.state, null, "statuspoll");
	}	
},

eventVolume: function( response)
{
	this.log.debug('Volume changed to ' + response);
    this.vol = response || 0;
	if ((this.vol>=0)&&(this.vol<=100))
		this.switchService.getCharacteristic(VolumeCharacteristic).setValue(this.vol, null, "statuspoll");
},

eventClose: function( response)
{
	this.log.debug( "eventClose: %s", response);
},

setPowerState: function(powerOn, callback, context) {
	var that = this;
//if context is statuspoll, then we need to ensure that we do not set the actual value
	if (context && context == "statuspoll") {
		this.log.debug( "setPowerState -- Status poll context is set, ignore request.");
		callback(null, powerOn);
	    return;
	}
    if (!this.ip_address) {
    	this.log.warn("Ignoring request; No ip_address defined.");
	    callback(new Error("No ip_address defined."));
	    return;
    }

    if (powerOn) {
		this.log.debug("Setting power state to ON");
		this.eiscp.command("system-power=on", function(error, response) {
			this.log.debug( "PWR ON: %s - %s", error, response);
			this.state = powerOn;
			callback( error, powerOn);
		}.bind(this) );
	} else {
		this.log.debug("Setting power state to OFF");
		this.eiscp.command("system-power=standby", function(error, response) {
			this.log.debug( "PWR OFF: %s - %s", error, response);
			this.state = powerOn;
			callback( error, powerOn);
		}.bind(this) );		
    }
},
  
getPowerState: function(callback, context) {
//if context is statuspoll, then we need to request the actual value
	if (!context || context != "statuspoll") {
		if (this.switchHandling == "poll") {
			this.log.debug("getPowerState - polling mode, return state: ", this.state);
			callback(null, this.state);
			return;
		}
	}
	
    if (!this.ip_address) {
    	this.log.warn("Ignoring request; No ip_address defined.");
	    callback(new Error("No ip_address defined."));
	    return;
    }
	
    this.log.debug("Getting power state");
	var that = this;
	
	this.eiscp.command("system-power=query", function( response, data) {
		this.log.debug( "PWR Q: %s - %s", response, data);
		callback(null, this.state);
	}.bind(this) );

},

setVolume: function(volume, callback, context) {
	var that = this;
//if context is statuspoll, then we need to ensure that we do not set the actual value
	if (context && context == "statuspoll") {
		this.log.debug( "setVolume -- Status poll context is set, ignore request.");
		callback(null, volume);
	    return;
	}
    if (!this.ip_address) {
    	this.log.warn("Ignoring request; No ip_address defined.");
	    callback(new Error("No ip_address defined."));
	    return;
    }

    this.log.debug("Setting volume to " + volume);
	this.eiscp.command("volume=" + volume, function(error, response) {
		this.log.debug( "Volume changed to %s: %s - %s", volume, error, response);
		this.vol = volume;
		callback( error, volume);
	}.bind(this) );
},
    
getVolume: function(callback, context) {
//if context is statuspoll, then we need to request the actual value
	if (!context || context != "statuspoll") {
		if (this.switchHandling == "poll") {
			this.log.debug("getVolume - polling mode, return state: ", this.state);
			callback(null, this.state);
			return;
		}
	}
	
    if (!this.ip_address) {
    	this.log.warn("Ignoring request; No ip_address defined.");
	    callback(new Error("No ip_address defined."));
	    return;
    }
	
    this.log.debug("Getting power state");
	var that = this;
	
	this.eiscp.command("volume=query", function( response, data) {
		this.log.debug( "VOL Q: %s - %s", response, data);
		callback(null, this.vol);
	}.bind(this) );

},

identify: function(callback) {
    this.log.debug("Identify requested!");
    callback(); // success
},

getServices: function() {
	var that = this;

	var informationService = new Service.AccessoryInformation();
    informationService
    .setCharacteristic(Characteristic.Manufacturer, this.avrManufacturer)
    .setCharacteristic(Characteristic.Model, this.model)
    .setCharacteristic(Characteristic.SerialNumber, this.avrSerial);

	this.switchService = new Service.Switch(this.name);

	this.switchService
		.getCharacteristic(Characteristic.On)
		.on('get', this.getPowerState.bind(this))
		.on('set', this.setPowerState.bind(this));
	
	this.switchService
		.addCharacteristic(VolumeCharacteristic)
		.on('get', this.getVolume.bind(this))
		.on('set', this.setVolume.bind(this));
	
	return [informationService, this.switchService];
}
};

