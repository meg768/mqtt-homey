#!/usr/bin/env node

var Mqtt = require('mqtt');
//var MqttDispatch = require('./mqtt-dispatch.js');

const {io} = require("socket.io-client");

require('dotenv').config();
require('yow/prefixConsole')();



var MqttDispatch = function(client) {

	let topics = [];

	client.addListener('message', (topic, message) => {
	
		function isMatch(A, B) {
			var args = {};
	
			var A = A.split('/');
			var B = B.split('/');
	
			if (A.length != B.length)
				return null;
	
			for (let i = 0; i < A.length; i++) {
				if (A[i] != B[i]) {
					let match = B[i].match(/^:([a-zA-Z0-9]+)$/);
	
					if (!match)
						return null;
	
					args[match[1]] = A[i];
				}
			}
	
			return args;
		}

		message = message.toString();

		topics.forEach((item) => {
			let match = isMatch(topic, item);

			if (match) {
				client.emit(item, message, match);
			}
		});

	});

	client.on = function(topic, fn) {
		topics.push(topic);
		client.addListener(topic, fn);
	}

	return client;
}



class App {

	constructor() {
		var yargs = require('yargs');

		yargs.usage('Usage: $0 [options]')

		yargs.option('help',     {alias:'h', describe:'Displays this information'});
		yargs.option('config',   {describe:'Specifies JSON config file', default:'.config'});
		yargs.option('debug',    {describe:'Debug mode', type:'boolean', default:false});

		yargs.help();
		yargs.wrap(null);

		yargs.check(function(argv) {
			return true;
		});

		this.argv    = yargs.argv;
		this.config  = require('yow/config')(this.argv.config);
		this.log     = console.log;
		this.debug   = this.argv.debug || this.config.debug ? this.log : () => {};
		this.cache   = {};
	}


	async publish(topic, value) {

		return new Promise((resolve, reject) => {
			topic = `${this.config.topic}/${topic}`;
			value = JSON.stringify(value);
			this.debug(`Publishing ${topic}:${value}`);
			this.cache[topic] = value;
			this.mqtt.publish(topic, value, {retain:true}, (error) => {

				this.cache[topic] = undefined;

				if (error)
					reject(error);
				else 
					resolve();
			});

	
		});

	}

	async run() {
		try {
			this.socket = io(this.config.socket);
			this.mqtt = Mqtt.connect(this.config.host, {username:this.config.username, password:this.config.password, port:this.config.port});
			this.mqtt = MqttDispatch(this.mqtt);
			this.subscribing = false;
					
			this.mqtt.on('connect', () => {
				this.debug(`Connected to host ${this.config.host}:${this.config.port}.`);

			});

			this.socket.on('homey', async (payload) => {
				// Now connected to Homey. The payload is all zones and devices
				console.log(`Connected to Homey.`);		
	
				// Payload contains all Homey devices and zones
				let {devices, zones} = payload;
	
				this.devices = devices;
				this.zones = zones;

	

                // Publish all
				for (let [deviceID, device] of Object.entries(devices)) {

					if (device.capabilitiesObj) {
						for (let [capabilityID, capability] of Object.entries(device.capabilitiesObj)) {
							let deviceKey = deviceID; // `${device.zoneName}/${device.name}`;
							let deviceCapabilityID = `${deviceKey}/${capabilityID}`;

							await this.publish(`${deviceKey}`, {zone:device.zoneName, name:device.name});
							await this.publish(`${deviceCapabilityID}`, capability.value);

						}
	
					}
				}

                

				for (let [deviceID, device] of Object.entries(devices)) {

					if (device.capabilitiesObj) {
						for (let [capabilityID, capability] of Object.entries(device.capabilitiesObj)) {
							let deviceCapabilityID = `${deviceID}/${capabilityID}`;
							let topic = `${this.config.topic}/${deviceCapabilityID}`;
						
							this.socket.on(deviceCapabilityID, (value) => {
								this.publish(deviceCapabilityID, value);
							});

							this.mqtt.subscribe(topic, {}, async () => {
	
								await this.mqtt.on(topic, async (value) => {
	
									try {
										if (this.cache[topic] == undefined) {
											value = JSON.parse(value);

											this.debug(`Emitting ${deviceCapabilityID}:${value}`);

											this.socket.emit(`${deviceCapabilityID}`, value, (error) => {
												if (error)
													console.log(error);
											});								
		
										}
	
									}
									catch(error) {
										this.log(error.message);
									}
		
		
					
								});	
							});

						}
	
					}
				}

			});

		}
		catch(error) {
			console.error(error.stack);
		}

	}

}

async function run() {
	let app = new App();
	await app.run();
}

run();
