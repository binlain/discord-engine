module.exports = new Class({

	Extends: Command,

	execute: function(direction) {
		var room = this.getRoom(),
		    player = this;
		if (room && room.exits[direction]) {
			var success = this.moveTo(room.exits[direction], {
				onFailure: function(e) {
					player.sendError(e);
				}
			});
			if (!success) return "You can't go that way."
			this.emit("%You leave%s "+direction+".");
			this.force('look');
			return true;
		} else {
			return "There's nothing in that direction.";
		}
	}

});
