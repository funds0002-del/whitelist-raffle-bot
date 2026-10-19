const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the bot with the password')
    .addStringOption(option =>
      option.setName('password')
        .setDescription('The bot password')
        .setRequired(true)
    ),

  async execute(interaction) {
    // The actual check is handled in index.js
    // This file just registers the command
  },
};
