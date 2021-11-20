import { client } from "../index"
import { ids } from "../config.json"
import { db, cancelledEvents } from "../lib/dbclient"

import type { EventDb } from "../lib/util"

client.on("messageReactionRemove", async (reaction, user) => {
	if (!db) return void cancelledEvents.push({ listener: "messageReactionRemove", args: [reaction, user] })

	if (reaction.message.channel.type !== "DM" && !user.bot) {
		if (reaction.emoji.name === "vote_yes") {
			const eventDb = await db.collection("config").findOne<EventDb>({ name: "event" }) as EventDb
			if (eventDb.ids.includes(reaction.message.id)) {
				const member = reaction.message.guild!.members.cache.get(user.id)
				await member?.roles.remove(ids.roles.event)
			}
		}
	}
})
