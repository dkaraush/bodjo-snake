let width, height;
let map = null;

bodjo.on('connect', socket => {
	let playing = false;

	socket.on('map', _map => {
		map = _map;
		if (typeof map[0] === 'string')
			map = map.map(row => row.split(''));
		height = map.length;
		width = map[0].length;
	});

	socket.on('field', (data) => {
		let field = parseField(data, map);
		window.lastField = field;
		bodjo.render(field);

		if (playing && field.me)
			tick(field);
	});

	socket.on('disconnect', () => {
		playing = false;
		bodjo.getControl('play').setActive(false);
	});

	let onTick = null;
	function compile() {
		try {
			onTick = null;
			onTick = new Function(bodjo.editor.getValue())();
			if (typeof onTick !== 'function') {
				bodjo.showError('code should return function');
				return false;
			}
			return true;
		} catch (e) {
			bodjo.showError(e);
			return false;
		}
	}
	function tick(field) {
		if (typeof onTick !== 'function') {
			if (!compile()) {
				stop();
				return;
			}
		}

		let result;
		try {
			result = onTick(field)
		} catch (e) {
			bodjo.showError(e);
			stop();
			return;
		}

		if (!Number.isInteger(result) ||
			result < 0 || result > 4) {
			bodjo.showError('function should return an integer in range [0, 3] \n(');
			stop();
			return;
		}

		socket.emit('turn', result);
	}

	function start() {
		if (playing) return;
		playing = true;
		bodjo.getControl('play').setActive(true);
		compile();
		socket.emit('join');
	}

	function stop() {
		if (!playing) return;
		playing = false;
		bodjo.getControl('play').setActive(false);
		socket.emit('leave');
	}

	bodjo.controls = [
		Button('play', start),
		Button('pause', stop)
	];
});

bodjo.on('scoreboard', (scoreboard) => {
	bodjo.renderScoreboard(['Place', 'Username', 'Max Length'], 
						   scoreboard.map(player => [
						   		'<b>'+player.place+'</b>',
						   		Player(player.username),
						   		player.value
						   ])
	);
});


function parseField(data, map) {
	let d = new DataView(data);

	let bonus = d.getUint16(0, true);
	let playersCount = d.getUint8(2);

	let O = {
		width, 
		height,
		players: [], 
		me: null,
		enemies: [],
		bonus: v(bonus)
	};
	let offset = 3;
	for (let i = 0; i < playersCount; ++i) {
		let id = d.getUint8(offset++),
			dir = d.getUint8(offset++),
			len = d.getUint8(offset++);
		let snake = new Array(len);
		for (let j = 0; j < len; ++j) {
			snake[j] = v(d.getUint16(offset, true));
			offset += 2;
		}
		let pO = {
			id,
			username: bodjo.ids[id] || '...',
			direction: dir,
			length: len,
			snake
		};

		pO.x = snake[len-1].x;
		pO.y = snake[len-1].y;

		if (pO.username == bodjo.username)
			O.me = pO; 
		else 
			O.enemies.push(pO);
		O.players.push(pO);
	}
	O.rawMap = map;
	O.map = generateMap(map, O);
	return O;
}
function generateMap(map, o) {
	let newMap = new Array(map.length);
	for (let y = 0; y < map.length; ++y) {
		newMap[y] = new Array(map[y].length);
		for (let x = 0; x < map[y].length; ++x)
			newMap[y][x] = map[y][x];
	}

	newMap[o.bonus.y][o.bonus.x] = 'b';
	for (let player of o.players) {
		for (let s of player.snake) {
			newMap[s.y][s.x] = o.me&&o.me.id==player.id ? 'm' : 'e';
		}
	}
	return newMap;
}
function v(u) {
	return {
		x: u % width,
		y: (u - (u % width)) / width
	};
}