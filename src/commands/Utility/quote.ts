import { errorColor, successColor, neutralColor } from "../../config.json"
import Discord from "discord.js"
import { db } from "../../lib/dbclient"
import type { Collection } from "mongodb"
import { client, Command, GetStringFunction } from "../../index"
import type { Quote } from "../../lib/util"

const command: Command = {
	name: "quote",
	description: "Gets (or adds) a funny/weird/wise quote from the server.",
	options: [{
		type: "SUB_COMMAND",
		name: "get",
		description: "Get a random/specific quote",
		options: [{
			type: "INTEGER",
			name: "index",
			description: "The index of the quote you want to see",
			required: false
		}]
	},
	{
		type: "SUB_COMMAND",
		name: "add",
		description: "Adds/requests a new quote",
		options: [{
			type: "STRING",
			name: "quote",
			description: "The quote you want to add",
			required: true
		},
		{
			type: "USER",
			name: "author",
			description: "The author of this quote",
			required: true
		}]
	},
	{
		type: "SUB_COMMAND",
		name: "edit",
		description: "Edits a quote. Staff only",
		options: [{
			type: "INTEGER",
			name: "index",
			description: "The index of the quote to edit",
			required: true
		},
		{
			type: "STRING",
			name: "quote",
			description: "The new quote",
			required: true
		}]
	},
	{
		type: "SUB_COMMAND",
		name: "delete",
		description: "Deletes a quote. Staff only",
		options: [{
			type: "INTEGER",
			name: "index",
			description: "The index of the quote to delete",
			required: true
		}]
	},
	{
		type: "SUB_COMMAND",
		name: "link",
		description: "Links a quote to a message. Staff only",
		options: [{
			type: "INTEGER",
			name: "index",
			description: "The index of the quote to link",
			required: true
		},
		{
			type: "STRING",
			name: "url",
			description: "The URL of the message to link this quote to",
			required: true
		}]
	}],
	cooldown: 5,
	allowDM: true,
	channelWhitelist: ["549894938712866816", "624881429834366986", "730042612647723058"], //bots staff-bots bot-development 
	async execute(interaction, getString: GetStringFunction) {
		const executedBy = getString("executedBy", { user: interaction.user.tag }, "global"),
			collection = db.collection<Quote>("quotes"),
			subCommand = interaction.options.getSubcommand()
		let allowed = false
		if ((interaction.member as Discord.GuildMember | undefined)?.permissions.has("VIEW_AUDIT_LOG")) allowed = true
		if (subCommand === "add") {
			const quote = interaction.options.getString("quote", true),
				author = interaction.options.getUser("author", true)
			if (!allowed) {
				const staffBots = client.channels.cache.get("624881429834366986") as Discord.TextChannel
				const report = new Discord.MessageEmbed()
					.setColor(neutralColor as Discord.HexColorString)
					.setAuthor("Quote")
					.setTitle("A quote request has been submitted!")
					.setDescription(`${quote}\n       - ${author}`)
					.setFooter(`Suggested by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
				await staffBots.send({ content: `/quote add quote:${quote} author:@${author.tag}`, embeds: [report] })
				const embed = new Discord.MessageEmbed()
					.setColor(successColor as Discord.HexColorString)
					.setAuthor(getString("moduleName"))
					.setTitle(getString("reqSub"))
					.setDescription(`${quote}\n       - ${author}`)
					.setFooter(executedBy, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
				await interaction.reply({ embeds: [embed] })
			} else await addQuote(interaction, quote, author, collection)
		} else if (subCommand === "edit" && allowed) await editQuote(interaction, collection)
		else if (subCommand === "delete" && allowed) await deleteQuote(interaction, collection)
		else if (subCommand === "link" && allowed) await linkQuote(interaction, collection)
		else if (subCommand === "get") await findQuote(executedBy, interaction, getString, collection)
		else await interaction.reply({ content: getString("errors.noAccess", "global"), ephemeral: true })
	}
}

async function findQuote(executedBy: string, interaction: Discord.CommandInteraction, getString: GetStringFunction, collection: Collection<Quote>) {

	const count = await collection.estimatedDocumentCount()

	let quoteId = interaction.options.getInteger("index", false)
	quoteId ??= Math.ceil(Math.random() * Math.floor(count)) //generate random id if no arg is given

	const quote = await collection.findOne({ id: quoteId })
	if (!quote) {
		const embed = new Discord.MessageEmbed()
			.setColor(errorColor as Discord.HexColorString)
			.setAuthor(getString("moduleName"))
			.setTitle(getString("invalidArg"))
			.setDescription(getString("indexArg", { arg: quoteId!, max: count }))
			.setFooter(executedBy, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
		return await interaction.reply({ embeds: [embed], ephemeral: true })
	}
	console.log(`Quote with ID ${quoteId} was requested`)
	const author = await Promise.all(quote.author.map(async a => interaction.guild!.members.cache.get(a)?.toString() ?? (await client.users.fetch(a)).tag)),
		embed = new Discord.MessageEmbed()
			.setColor(successColor as Discord.HexColorString)
			.setAuthor(getString("moduleName"))
			.setTitle(quote.quote)
			.setDescription(`      - ${author.join(" and ")}`)
			.setFooter(executedBy, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
	if (quote.url) embed.addField(getString("msgUrl"), quote.url)
	return await interaction.reply({ embeds: [embed] })
}

async function addQuote(interaction: Discord.CommandInteraction, quote: string, author: Discord.User, collection: Collection<Quote>) {

	const quoteId = (await collection.estimatedDocumentCount()) + 1

	await collection.insertOne({ id: quoteId, quote: quote, author: [author.id] })
	const embed = new Discord.MessageEmbed()
		.setColor(successColor as Discord.HexColorString)
		.setAuthor("Quote")
		.setTitle("Success! The following quote has been added:")
		.setDescription(quote)
		.addFields(
			{ name: "User", value: `${author}` },
			{ name: "Quote number", value: `${quoteId}` }
		)
		.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
	await interaction.reply({ embeds: [embed] })
}

async function editQuote(interaction: Discord.CommandInteraction, collection: Collection<Quote>) {

	const quoteId = interaction.options.getInteger("index", true),
		newQuote = interaction.options.getString("quote", true)
	if (!quoteId) throw "noQuote"
	const result = await collection.findOneAndUpdate({ id: quoteId }, { $set: { quote: newQuote } })
	if (result.value) {
		const author = await Promise.all(result.value.author.map(async a => await client.users.fetch(a))),
			embed = new Discord.MessageEmbed()
				.setColor(successColor as Discord.HexColorString)
				.setAuthor("Quote")
				.setTitle(`Successfully edited quote #${quoteId}`)
				.addFields(
					{ name: "Old quote", value: result.value.quote },
					{ name: "New quote", value: newQuote },
					{ name: "Author", value: author.join(" and ") },
					{ name: "Link", value: result.value.url || "None" }
				)
				.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
		await interaction.reply({ embeds: [embed] })
	} else {
		const embed = new Discord.MessageEmbed()
			.setColor(errorColor as Discord.HexColorString)
			.setAuthor("Quote")
			.setTitle("Couldn't find a quote with that ID!")
			.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
		await interaction.reply({ embeds: [embed], ephemeral: true })
	}
}

async function deleteQuote(interaction: Discord.CommandInteraction, collection: Collection<Quote>) {

	const quoteId = interaction.options.getInteger("index", true)
	if (quoteId <= 0) throw "noQuote"
	const result = await collection.findOneAndDelete({ id: quoteId })
	if (result.value) {
		const author = await Promise.all(result.value.author.map(async a => await client.users.fetch(a)))
		await collection.updateMany({ id: { $gt: quoteId } }, { $inc: { id: -1 } })
		const embed = new Discord.MessageEmbed()
			.setColor(successColor as Discord.HexColorString)
			.setAuthor("Quote")
			.setTitle(`Successfully deleted quote #${quoteId}`)
			.addFields(
				{ name: "Author", value: author.join(" and ") },
				{ name: "Quote", value: result.value.quote },
				{ name: "Link", value: result.value.url || "None" }
			)
			.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
		await interaction.reply({ embeds: [embed] })
	} else {
		const embed = new Discord.MessageEmbed()
			.setColor(errorColor as Discord.HexColorString)
			.setAuthor("Quote")
			.setTitle("Couldn't find a quote with that ID!")
			.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
		await interaction.reply({ embeds: [embed], ephemeral: true })
	}
}

async function linkQuote(interaction: Discord.CommandInteraction, collection: Collection<Quote>) {
	const quoteId = interaction.options.getInteger("index", true),
		urlSplit = interaction.options.getString("url", true).split("/");
	(client.channels.cache.get(urlSplit[5] as Discord.Snowflake) as Discord.TextChannel | undefined)?.messages.fetch(urlSplit[6] as Discord.Snowflake)
		.then(async msg => {
			const result = await collection.findOneAndUpdate({ id: quoteId }, { $set: { url: msg.url } })
			if (result.value) {
				const author = await Promise.all(result.value.author.map(a => client.users.fetch(a))),
					embed = new Discord.MessageEmbed()
						.setColor(successColor as Discord.HexColorString)
						.setAuthor("Quote")
						.setTitle(`Successfully linked quote #${quoteId}`)
						.addFields(
							{ name: "Old URL", value: result.value.url || "None" },
							{ name: "New URL", value: msg.url },
							{ name: "Quote", value: result.value.quote },
							{ name: "Author", value: author.join(" and ") }
						)
						.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
				await interaction.reply({ embeds: [embed] })
			} else {
				const embed = new Discord.MessageEmbed()
					.setColor(errorColor as Discord.HexColorString)
					.setAuthor("Quote")
					.setTitle("Couldn't find a quote with that ID!")
					.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
				await interaction.reply({ embeds: [embed], ephemeral: true })
			}
		})
		.catch(async () => {
			const embed = new Discord.MessageEmbed()
				.setColor(errorColor as Discord.HexColorString)
				.setAuthor("Quote")
				.setTitle("Couldn't find a message linked to that URL!")
				.setDescription("Make sure you obtained it by coping the message URL directly and that I have permission to see that message.")
				.setFooter(`Executed by ${interaction.user.tag}`, interaction.user.displayAvatarURL({ format: "png", dynamic: true }))
			await interaction.reply({ embeds: [embed], ephemeral: true })
		})
}

export default command
