require('dotenv').config();

const { REST, Routes } = require('discord.js');
const raffleCommand = require('./commands/raffle/create.js');

const commands = [
  raffleCommand.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(
  process.env.DISCORD_TOKEN
);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error(
      '❌ Error registering commands:',
      error
    );
  }
})();