

module.exports = function(client) {

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


