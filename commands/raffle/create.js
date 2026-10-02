const fs = require('fs');
const path = require('path');

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const dataDirectory = path.join(__dirname, '../../data');
const guildsFile = path.join(dataDirectory, 'guilds.json');

function loadGuilds() {
  try {
    return JSON.parse(fs.readFileSync(guildsFile, 'utf8'));
  } catch (error) {
    console.error('❌ Could not load guild settings:', error);
    return { guilds: {} };
  }
}

function saveGuilds(data) {
  fs.writeFileSync(guildsFile, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raffle')
    .setDescription('Manage whitelist raffles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new whitelist raffle')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configure the Verified role for raffles')
        .addRoleOption(option =>
          option
            .setName('verified_role')
            .setDescription('Select the role verified members have')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('End an active raffle early')
        .addStringOption(option =>
          option
            .setName('raffle_id')
            .setDescription('The ID of the raffle to end')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel an active raffle')
        .addStringOption(option =>
          option
            .setName('raffle_id')
            .setDescription('The ID of the raffle to cancel')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('participants')
        .setDescription('View raffle participants')
        .addStringOption(option =>
          option
            .setName('raffle_id')
            .setDescription('The ID of the raffle')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reroll')
        .setDescription('Reroll a winner from an ended raffle')
        .addStringOption(option =>
          option
            .setName('raffle_id')
            .setDescription('The raffle ID')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('winner_number')
            .setDescription('The winner number to reroll')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export raffle winners and their emails')
        .addStringOption(option =>
          option
            .setName('raffle_id')
            .setDescription('The raffle ID')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      const modal = new ModalBuilder()
        .setCustomId('raffle_create_modal')
        .setTitle('Create Whitelist Raffle');

      const titleInput = new TextInputBuilder()
        .setCustomId('raffle_title')
        .setLabel('Raffle Title')
        .setPlaceholder('Example: 3Dceased Whitelist Giveaway')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('raffle_description')
        .setLabel('Description')
        .setPlaceholder('Tell members what this raffle is about...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const winnersInput = new TextInputBuilder()
        .setCustomId('raffle_winners')
        .setLabel('Number of Winners')
        .setPlaceholder('Example: 5')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      const durationInput = new TextInputBuilder()
        .setCustomId('raffle_duration')
        .setLabel('Duration')
        .setPlaceholder('Example: 24h, 3d, 1w')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(winnersInput),
        new ActionRowBuilder().addComponents(durationInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (subcommand === 'setup') {
      const verifiedRole = interaction.options.getRole('verified_role');
      const guildsData = loadGuilds();

      if (!guildsData.guilds[interaction.guildId]) {
        guildsData.guilds[interaction.guildId] = {};
      }

      guildsData.guilds[interaction.guildId].verifiedRoleId = verifiedRole.id;
      saveGuilds(guildsData);

      await interaction.reply({
        content:
          `✅ Raffle verification has been configured!\n\n` +
          `🔒 Verified Role: ${verifiedRole}\n\n` +
          `Only members with this role will be able to enter raffles.`,
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'end') return;
    if (subcommand === 'cancel') return;
    if (subcommand === 'participants') return;
    if (subcommand === 'reroll') return;
    if (subcommand === 'export') return;
  },
};