Living = new Class({

	Extends: Base,

	Implements: [Events, Options, Container, CombatStandard],

	//The name of the living when seen in a list of things.
	short: null,

	//The description of the living seen when examined.
	long: null,

	gender: 'male', //OMG SEXIST!!!!!ONE!!!!

	//The UNIQUE name of this living.
	name: null,

	//The world object, filled in when the living enters the world.
	world: null,

	//The room object, filled in when the living moves to a new room.
	room: null,

	//The path name of the room. We'll save this for the player.
	location: null,

	//Commands added to the queue are executed once per heartbeat.
	queue: [],

	//Will be filled with the periodic timer when the heart is started.
	heartTimer: null,

	//How often the living will try to do something from its chatter list.
	chat_rate: null,

	//A bunch of things the living can do at random intervals.
	chatter: [],

	//Same as item aliases.
	aliases: [],

	//List of currently equipped items.
	equipped: [],

	init: function(name) {
		if (name) this.set('name', name);
		this.startHeart();
		this.create();
	},

	set_short: function(short) {
		this.short = short;
	},

	set_long: function(long) {
		this.long = long;
	},

	set_determinate: function(det) {
		this.determinate = det;
	},

	add_alias: function(alias) {
		this.aliases.push(alias);
	},

	load_chat: function(rate, chatter) {
		this.chat_rate = rate;
		this.chatter = chatter;
	},

	doChat: function() {
		var n = (Math.random()*100).floor();
		if (n<this.chat_rate) {
			this.force(this.chatter.getRandom());
		}
	},

	describeInventory: function(obsv) {
		var lines = [];
		if (this.equipped.length) {
			lines.push(this.genderize('%You %are wearing ', obsv)+
			           this.listItems(this.equipped).conjoin()+'.');
		}
		if (this.items.length) {
			lines.push(this.genderize('%You %are carrying ', obsv)+
			           this.listItems().conjoin()+'.');
		}
		return lines;
	},

	getDescription: function(observer) {
		reply = [];
		if (!this.get('long')) reply.push(this.genderize('%you look%s pretty ordinary.', observer));
		reply.push(this.get('long'));
		this.describeInventory(observer).each(function(l) {
			reply.push(l);
		});
		return reply;
	},

	getShort: function(short) {
		return this.name || this.short || "a thing";
	},

	getDefinite: function() {
		if (this.player) { return this.name; }
		var det = this.get('determinate') || 'the ';
		if (this.room.getLiving(this.get('short'))) {
			return "one of "+det+" "+short.pluralize();
		} return det+this.get('short');
	},

	getIndefinite: function() {
		if (this.player) { return this.name; }
		var short = this.get('short');
		return short.getArticle()+' '+short;
	},

	genderize: function(str, you) {

		var male = (this.gender=='male');
		var name = this.get('definite');

		var pronouns = {
			'you'   : (male) ? 'he'  : 'she',
			'You'   : name, //(male) ? 'He'  : 'She',
			'yours' : (male) ? 'his' : 'her',
			'Yours' : (male) ? 'His' : 'Her',
			"You're" : name+"'s",
			"you're" : (male) ? "he's" : "she's",
			'your'  : (male) ? 'his' : 'her',
			'yourself' : (male) ? 'himself' : 'herself',
			'Your'  : name+"'s", //(male) ? 'His' : 'her',
			's'     : 's',
			'es'    : 'es',
			'y'     : 'ies',
			'are'   : 'is'
		};

		if (you) {
			var set = {};
			Object.each(pronouns, function(v,k) {
				set[k] = k;	
			});
			set.s = '';
			set.es = '';
			pronouns = set;
		}

		var match = str.match(/%([A-Z'a-z]+)/g);
		if (!match) return str;

		match.each(function(k) {
			var k = k.replace(/^%/, '');
			if (pronouns[k]!==undefined) str = str.replace('%'+k, pronouns[k]);
		});

		return str;
	},

	setRoom: function(room) {
		if (this.get('room') && this.player) this.get('room').removePlayer(this);
		else if (this.get('room')) this.get('room').removeLiving(this);
		this.room = room;
		if (this.player) this.room.addPlayer(this);
		else this.room.addNPC(this);
		this.location = this.room.path;
	},
	
	getRoom: function() {
		if (!this.room) return false;
		return this.room;
	},

	setLocation: function(path) {
		var room = this.world.getRoom(path);
		if (!room) {
			log_error("Can't find room for "+path);
			return;
		}
		this.setRoom(this.world.getRoom(path));
		this.location = path;
	},

	//moveTo Includes tracking which players are where.
	moveTo: function(path) {
		var room = this.world.getRoom(path);
		if (!room) return false;
		this.set('room', room);
		return true;
   	},

	/**
	 * If it's living, it has a heart beat.  Every time the heart beats, the 
	 * next command in the action queue will be called.
	 */
	startHeart: function() {
		this.heartTimer = this.beatHeart.periodical(1000, this);
	},

	/**
	 * If there's a queue, the next action will be called up.  If there's not,
	 * run the regen routine and check to see if the player is dead (ie, if 
	 * their heart should KEEP beating).
	 */
	beatHeart: function() {
		this.checkStats();
		if (this.callNextAction()) return true;
		//If no action is queued, do a chat and rest.
		this.doChat();
		this.rest();
	},

	/**
	 * Stops the character from acting.  Should happen upon death, but
	 * heartbeat should NOT be confused with a physical, game-mechanic
	 * heartbeat.
	 */
	stopHeart: function() {
		clearTimeout(this.heartTimer);
		this.heartTimer = null;
	},

	/**
	 * Because 'send' likes to send things to the character, and NPCs don't
	 * need to be sent messages.
	 */
	send: function(message, delay) { },

	/**
	 * Emits a message to everyone in the room.
	 */
	emit: function(message, style) {
		var my = this;
		var me = this.get('short');
		if (!this.get('room')) {
			log_error("Living "+this.get('short')+" should have a room but does not!");
			return;
		}
		var first, third;
		/**
		 * If an array is passed as the first argument, use those as first-
		 * and third-person messages.
		 */
		if (message.each) {
			second = message[0];
			third = my.get('short')+' '+message[1];
		} else {
			second = my.genderize(message, this);
			third  = my.genderize(message);
		}
		Object.each(this.get('room').get('players'), function(player, name) {
			//If this player isn't the emitter, use third person.
			if (player.name != me) player.send(third, style);
			//Otherwise, use second.
			else player.send(second, style);
		});
	},

	/**
	 * When a player enters a command, we'll add it to the command stack.
	 */
	queueCommand: function(str) {

		this.queue.push(str);

	},

	parseCommand: function(string) {

		if (!string) return;

		string = string.trim();

		if (string=='__wait') return;

		var params = string.split(' ');
		var command = params.shift();
		var out = '';
		var com = this.world.getCommand(command);

		if (this.get('room') && this.get('room').hasExit(string)){
			this.force('move '+ string);
			return this.force('look');
		} else if (com){
			params = params.join(' ');
			if (com.can_execute.bind(this)) {
				out = com.execute.bind(this).pass(params,com)();
			}
		}

		//The commands either have to return before this point or have
		//output that is equal to true or a string.
		//
		//Otherwise, the parser will treat it like an invalid command.

		if (out===true) return;
		if (!out) out = 'What?';
		
		this.send(out);

	},

	callNextAction: function() {
		if (this.queue.length) {
			return this.parseCommand(this.queue.shift());
		} else if (this.target) {
			return this.combatTurn();
		}
	},

	/**
	 * Force the character to do something.
	 */
	force: function(command) {
		return this.parseCommand(command);
	},

/**
 * Item-related stuff (equipment).
 */

	/* Triggered when someone gives this character something. */
	on_get: function(item, source) { return; },

	giveItem: function(item, target) {

		//Check to see if there's a on_drop function on the item (for cursed
		//items and the like).
		var success = item.on_drop(this);
		if (success===false) { return false; }

		//Remove this item from the giver's inventory.
		this.removeItem(item);
		target.addItem(item);
		target.on_get(item, this);

		return true;

	},

	getItem: function(name) {
		if (this.equipped && this.getEquippedItem(name)) {
			return this.getEquippedItem(name);
		}
		var item = false;
		this.items.each(function(i){
			if (!item && i.matches(name)) item = i;
		});
		return item;
	},

	getEquippedItem: function(name) {
		var name = name.split(' ')[0];
		var item = false;
		this.equipped.each(function(i){
			if (!item && i.matches(name)) item = i;
		});
		return item;
	},

	equipItem: function(item) {
		if (item.on_equip(this) === false) return false;
		this.items.erase(item);
		this.equipped.push(item);
	},

	unequipItem: function(item) {
		if (item.on_remove(this) === false) return false;
		this.items.push(item);
		this.equipped.erase(item);
	},

	respondTo: function(player, keyword) {
		if (this.talkMenu) this.world.enterMenu(this.talkMenu, player, this);
	},

/**
 * Fun things to implement if we have time later.
 */

	increaseHeartrate: function(times) {

	},

	decreaseHeartrate: function(times) {

	},

	wait: function(turns)  {
		var me = this;
		turns.toInt().times(function() { me.force('__wait'); });
	},

	freeze: function() {
		unset(this.heartTimer);
	},

	unfreeze: function() {
		this.startHeart();
	},

	passOut: function() {

	},

	wakeUp: function() {

	}

});
