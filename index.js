require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

client.commands = new Collection();

const raffleCommand = require('./commands/raffle/create.js');

client.commands.set(
  raffleCommand.data.name,
  raffleCommand
);

// ==============================
// DATA STORAGE
// ==============================

const dataDirectory = path.join(__dirname, 'data');
const raffleFile = path.join(dataDirectory, 'raffles.json');
const guildsFile = path.join(dataDirectory, 'guilds.json');

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

// Create raffles.json if it doesn't exist
if (!fs.existsSync(raffleFile)) {
  fs.writeFileSync(
    raffleFile,
    JSON.stringify(
      {
        nextRaffleNumber: 1,
        raffles: {},
      },
      null,
      2
    )
  );
}

// Create guilds.json if it doesn't exist
if (!fs.existsSync(guildsFile)) {
  fs.writeFileSync(
    guildsFile,
    JSON.stringify(
      {
        guilds: {},
      },
      null,
      2
    )
  );
}

// ==============================
// RAFFLE DATA FUNCTIONS
// ==============================

function loadRaffles() {
  try {
    const data = fs.readFileSync(
      raffleFile,
      'utf8'
    );

    return JSON.parse(data);

  } catch (error) {
    console.error(
      '❌ Could not load raffle data:',
      error
    );

    return {
      nextRaffleNumber: 1,
      raffles: {},
    };
  }
}

function saveRaffles(data) {
  fs.writeFileSync(
    raffleFile,
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

// ==============================
// GUILD SETTINGS FUNCTIONS
// ==============================

function loadGuilds() {
  try {
    const data = fs.readFileSync(
      guildsFile,
      'utf8'
    );

    return JSON.parse(data);

  } catch (error) {
    console.error(
      '❌ Could not load guild settings:',
      error
    );

    return {
      guilds: {},
    };
  }
}

// ==============================
// RAFFLE ID
// ==============================

function createRaffleId(number) {
  return `RAFFLE-${String(number).padStart(4, '0')}`;
}

// ==============================
// RANDOM WINNER SELECTION
// ==============================

function selectRandomWinners(
  participants,
  winnerCount
) {
  const shuffled = [
    ...participants,
  ];

  // Fisher-Yates shuffle
  for (
    let i = shuffled.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [
      shuffled[i],
      shuffled[j],
    ] = [
      shuffled[j],
      shuffled[i],
    ];
  }

  return shuffled.slice(
    0,
    winnerCount
  );
}

// ==============================
// END RAFFLE
// ==============================

async function endRaffle(
  raffleId
) {
  const raffleData =
    loadRaffles();

  const raffle =
    raffleData.raffles[
      raffleId
    ];

  if (!raffle) {
    console.error(
      `❌ Could not find raffle ${raffleId}`
    );

    return false;
  }

  // Prevent ending the same raffle twice
  if (
    raffle.status !== 'active'
  ) {
    return false;
  }

  console.log(
    `🏁 Ending raffle ${raffleId}...`
  );

  // ==============================
  // CLOSE RAFFLE
  // ==============================

  raffle.status = 'ended';

  // ==============================
  // SELECT WINNERS
  // ==============================

  if (
    raffle.participants.length === 0
  ) {
    raffle.winnersSelected = [];

    console.log(
      `⚠️ ${raffleId} ended with no entries.`
    );

  } else {
    const winnerCount =
      Math.min(
        raffle.winners,
        raffle.participants.length
      );

    raffle.winnersSelected =
      selectRandomWinners(
        raffle.participants,
        winnerCount
      );

    console.log(
      `🏆 ${raffleId} winners selected:`,
      raffle.winnersSelected
    );
  }

  // Save immediately
  // so the raffle cannot be ended twice
  saveRaffles(
    raffleData
  );

  // ==============================
  // GET CHANNEL
  // ==============================

  try {
    const channel =
      await client.channels.fetch(
        raffle.channelId
      );

    if (!channel) {
      console.error(
        `❌ Could not find channel for ${raffleId}`
      );

      return false;
    }

    // ==============================
    // DISABLE ENTER BUTTON
    // ==============================

    if (raffle.messageId) {
      try {
        const message =
          await channel.messages.fetch(
            raffle.messageId
          );

        const disabledButton =
          new ButtonBuilder()
            .setCustomId(
              `raffle_enter_${raffleId}`
            )
            .setLabel(
              'RAFFLE ENDED'
            )
            .setEmoji(
              '🔒'
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              true
            );

        const disabledRow =
          new ActionRowBuilder()
            .addComponents(
              disabledButton
            );

        await message.edit({
          components: [
            disabledRow,
          ],
        });

      } catch (error) {
        console.error(
          `⚠️ Could not disable button for ${raffleId}:`,
          error
        );
      }
    }

    // ==============================
    // ANNOUNCE RESULTS
    // ==============================

    if (
      raffle.winnersSelected.length === 0
    ) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              `🏁 ${raffle.title} — Raffle Ended`
            )
            .setDescription(
              'This raffle has ended, but there were no valid entries.'
            )
            .addFields({
              name:
                '🆔 Raffle ID',
              value:
                raffleId,
              inline:
                true,
            })
            .setFooter({
              text:
                'Whitelist Raffle',
            })
            .setTimestamp(),
        ],
      });

    } else {
      const winnerMentions =
        raffle.winnersSelected
          .map(
            userId =>
              `<@${userId}>`
          )
          .join('\n');

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              `🏆 ${raffle.title} — Winners`
            )
            .setDescription(
              `Congratulations to the winner${
                raffle.winnersSelected.length === 1
                  ? ''
                  : 's'
              }! 🎉`
            )
            .addFields(
              {
                name:
                  '🆔 Raffle ID',
                value:
                  raffleId,
                inline:
                  true,
              },
              {
                name:
                  '🎟️ Total Entries',
                value:
                  String(
                    raffle.participants.length
                  ),
                inline:
                  true,
              },
              {
                name:
                  raffle.winnersSelected.length === 1
                    ? '🏆 Winner'
                    : '🏆 Winners',
                value:
                  winnerMentions,
                inline:
                  false,
              }
            )
            .setFooter({
              text:
                'Whitelist Raffle • Raffle has ended',
            })
            .setTimestamp(),
        ],
      });
    }

    return true;

  } catch (error) {
    console.error(
      `❌ Could not announce results for ${raffleId}:`,
      error
    );

    return false;
  }
}

// ==============================
// CANCEL RAFFLE
// ==============================

async function cancelRaffle(
  raffleId
) {
  const raffleData =
    loadRaffles();

  const raffle =
    raffleData.raffles[
      raffleId
    ];

  if (!raffle) {
    console.error(
      `❌ Could not find raffle ${raffleId}`
    );

    return false;
  }

  if (
    raffle.status !== 'active'
  ) {
    console.error(
      `⚠️ Raffle ${raffleId} is not active. Current status: ${raffle.status}`
    );

    return false;
  }

  console.log(
    `🚫 Cancelling raffle ${raffleId}...`
  );

  // ==============================
  // CLOSE RAFFLE
  // ==============================

  raffle.status = 'cancelled';

  // Cancelled raffles cannot have winners
  raffle.winnersSelected = [];

  // Save immediately
  saveRaffles(
    raffleData
  );

  // ==============================
  // GET CHANNEL
  // ==============================

  try {
    const channel =
      await client.channels.fetch(
        raffle.channelId
      );

    if (!channel) {
      console.error(
        `❌ Could not find channel for ${raffleId}`
      );

      return true;
    }

    // ==============================
    // DISABLE ENTER BUTTON
    // ==============================

    if (raffle.messageId) {
      try {
        const message =
          await channel.messages.fetch(
            raffle.messageId
          );

        const disabledButton =
          new ButtonBuilder()
            .setCustomId(
              `raffle_enter_${raffleId}`
            )
            .setLabel(
              'RAFFLE CANCELLED'
            )
            .setEmoji(
              '🚫'
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              true
            );

        const disabledRow =
          new ActionRowBuilder()
            .addComponents(
              disabledButton
            );

        await message.edit({
          components: [
            disabledRow,
          ],
        });

      } catch (error) {
        console.error(
          `⚠️ Could not disable button for ${raffleId}:`,
          error
        );
      }
    }

    // ==============================
    // ANNOUNCE CANCELLATION
    // ==============================

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            `🚫 ${raffle.title} — Raffle Cancelled`
          )
          .setDescription(
            'This raffle has been cancelled and is no longer accepting entries.'
          )
          .addFields(
            {
              name:
                '🆔 Raffle ID',
              value:
                raffleId,
              inline:
                true,
            },
            {
              name:
                '🎟️ Total Entries',
              value:
                String(
                  raffle.participants.length
                ),
              inline:
                true,
            }
          )
          .setFooter({
            text:
              'Whitelist Raffle • Raffle cancelled',
          })
          .setTimestamp(),
      ],
    });

    console.log(
      `✅ Raffle ${raffleId} cancelled successfully.`
    );

    return true;

  } catch (error) {
    console.error(
      `❌ Could not complete cancellation for ${raffleId}:`,
      error
    );

    // The important part already happened:
    // the raffle was marked cancelled and saved.
    return true;
  }
}

// ==============================
// AUTOMATIC RAFFLE CHECKER
// ==============================

async function checkRaffles() {
  const raffleData =
    loadRaffles();

  const now =
    Date.now();

  for (
    const raffleId in raffleData.raffles
  ) {
    const raffle =
      raffleData.raffles[
        raffleId
      ];

    if (
      raffle.status === 'active' &&
      now >= raffle.endTime
    ) {
      await endRaffle(
        raffleId
      );
    }
  }
}

// ==============================
// BOT READY
// ==============================

client.once(
  'ready',
  async () => {

    console.log(
      `✅ Logged in as ${client.user.tag}`
    );

    console.log(
      '⏰ Automatic raffle checker started.'
    );

    // Check immediately
    await checkRaffles();

    // Check every 10 seconds
    setInterval(
      async () => {
        try {
          await checkRaffles();

        } catch (error) {
          console.error(
            '❌ Automatic raffle checker error:',
            error
          );
        }
      },
      10 * 1000
    );
  }
);

// ==============================
// INTERACTION HANDLER
// ==============================

client.on(
  'interactionCreate',
  async interaction => {

    // ==============================
    // RAFFLE CREATION FORM
    // ==============================
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('raffle_email_')
    ) {
      const raffleId = interaction.customId.replace('raffle_email_', '');
      const email = interaction.fields.getTextInputValue('raffle_email').trim();

      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!emailOk) {
        await interaction.reply({
          content: '❌ Please enter a valid email address.',
          ephemeral: true,
        });
        return;
      }

      const raffleData = loadRaffles();
      const raffle = raffleData.raffles[raffleId];

      if (!raffle || raffle.status !== 'active') {
        await interaction.reply({
          content: '❌ This raffle is no longer accepting entries.',
          ephemeral: true,
        });
        return;
      }

      if (Date.now() >= raffle.endTime) {
        await endRaffle(raffleId);
        await interaction.reply({
          content: '❌ This raffle has already ended.',
          ephemeral: true,
        });
        return;
      }

      if (raffle.participants.includes(interaction.user.id)) {
        await interaction.reply({
          content: '⚠️ You have already entered this raffle.',
          ephemeral: true,
        });
        return;
      }

      raffle.participants.push(interaction.user.id);
      raffle.participantEmails = raffle.participantEmails || {};
      raffle.participantEmails[interaction.user.id] = email;

      saveRaffles(raffleData);

      try {
        const message = await interaction.channel.messages.fetch(raffle.messageId);
        const updatedEmbed = EmbedBuilder.from(message.embeds[0]);
        const entriesFieldIndex = updatedEmbed.data.fields?.findIndex(
          field => field.name === '🎟️ Entries'
        );

        if (entriesFieldIndex !== -1) {
          updatedEmbed.spliceFields(entriesFieldIndex, 1, {
            name: '🎟️ Entries',
            value: String(raffle.participants.length),
            inline: true,
          });
        }

        await message.edit({
          embeds: [updatedEmbed],
          components: message.components,
        });
      } catch (error) {
        console.error('⚠️ Could not update raffle entry count:', error);
      }

      await interaction.reply({
        content:
          `🎉 You have entered **${raffle.title}**!\n` +
          `📧 Saved email: **${email}**\n` +
          `🎟️ Total entries: **${raffle.participants.length}**`,
        ephemeral: true,
      });
      return;
    }
    if (
      interaction.isModalSubmit() &&
      interaction.customId ===
        'raffle_create_modal'
    ) {

      try {

        const title =
          interaction.fields.getTextInputValue(
            'raffle_title'
          );

        const description =
          interaction.fields.getTextInputValue(
            'raffle_description'
          );

        const winners =
          interaction.fields.getTextInputValue(
            'raffle_winners'
          );

        const duration =
          interaction.fields.getTextInputValue(
            'raffle_duration'
          );

        // ==============================
        // VALIDATE WINNERS
        // ==============================

        const winnerCount =
          Number(winners);

        if (
          !Number.isInteger(
            winnerCount
          ) ||
          winnerCount < 1 ||
          winnerCount > 100
        ) {

          await interaction.reply({
            content:
              '❌ Number of winners must be a whole number between 1 and 100.',
            ephemeral:
              true,
          });

          return;
        }

        // ==============================
        // VALIDATE DURATION
        // ==============================

        const durationMatch =
          duration
            .toLowerCase()
            .trim()
            .match(
              /^(\d+)\s*(m|h|d|w)$/
            );

        if (
          !durationMatch
        ) {

          await interaction.reply({
            content:
              '❌ Invalid duration. Use something like `30m`, `24h`, `3d`, or `1w`.',
            ephemeral:
              true,
          });

          return;
        }

        const amount =
          Number(
            durationMatch[1]
          );

        const unit =
          durationMatch[2];

        let durationMs;

        if (
          unit === 'm'
        ) {

          durationMs =
            amount *
            60 *
            1000;

        } else if (
          unit === 'h'
        ) {

          durationMs =
            amount *
            60 *
            60 *
            1000;

        } else if (
          unit === 'd'
        ) {

          durationMs =
            amount *
            24 *
            60 *
            60 *
            1000;

        } else if (
          unit === 'w'
        ) {

          durationMs =
            amount *
            7 *
            24 *
            60 *
            60 *
            1000;
        }

        const endTime =
          Date.now() +
          durationMs;

        // ==============================
        // LOAD RAFFLE DATA
        // ==============================

        const raffleData =
          loadRaffles();

        // ==============================
        // CREATE RAFFLE ID
        // ==============================

        const raffleNumber =
          raffleData.nextRaffleNumber;

        const raffleId =
          createRaffleId(
            raffleNumber
          );

        raffleData.nextRaffleNumber += 1;

        // ==============================
        // CREATE RAFFLE RECORD
        // ==============================

        raffleData.raffles[
          raffleId
        ] = {

          id:
            raffleId,

          title,

          description,

          winners:
            winnerCount,

          duration,

          endTime,

          guildId:
            interaction.guildId,

          channelId:
            interaction.channelId,

          messageId:
            null,

          creatorId:
            interaction.user.id,

          participants: [],

          winnersSelected: [],

          status:
            'active',

          createdAt:
            Date.now(),
        };

        saveRaffles(
          raffleData
        );

        // ==============================
        // RAFFLE EMBED
        // ==============================

        const raffleEmbed =
          new EmbedBuilder()

            .setTitle(
              `🎟️ ${title}`
            )

            .setDescription(
              description
            )

            .addFields(

              {
                name:
                  '🆔 Raffle ID',

                value:
                  raffleId,

                inline:
                  true,
              },

              {
                name:
                  '🏆 Winners',

                value:
                  String(
                    winnerCount
                  ),

                inline:
                  true,
              },

              {
                name:
                  '🎟️ Entries',

                value:
                  '0',

                inline:
                  true,
              },

              {
                name:
                  '⏰ Ends',

                value:
                  `<t:${Math.floor(
                    endTime / 1000
                  )}:F>\n` +
                  `(<t:${Math.floor(
                    endTime / 1000
                  )}:R>)`,

                inline:
                  false,
              },

              {
                name:
                  '🔒 Requirement',

                value:
                  'Verified members only',

                inline:
                  false,
              }
            )

            .setFooter({
              text:
                'Whitelist Raffle • Good luck!',
            })

            .setTimestamp();

        // ==============================
        // ENTER BUTTON
        // ==============================

        const enterButton =
          new ButtonBuilder()

            .setCustomId(
              `raffle_enter_${raffleId}`
            )

            .setLabel(
              'ENTER RAFFLE'
            )

            .setEmoji(
              '🎟️'
            )

            .setStyle(
              ButtonStyle.Success
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              enterButton
            );

        // ==============================
        // SEND RAFFLE
        // ==============================

        const raffleMessage =
          await interaction.channel.send({
            embeds: [
              raffleEmbed
            ],

            components: [
              row
            ],
          });

        // ==============================
        // SAVE MESSAGE ID
        // ==============================

        raffleData
          .raffles[
            raffleId
          ]
          .messageId =
            raffleMessage.id;

        saveRaffles(
          raffleData
        );

        // ==============================
        // PRIVATE CONFIRMATION
        // ==============================

        await interaction.reply({
          content:
            `✅ Raffle **${raffleId}** has been created successfully!`,

          ephemeral:
            true,
        });

        return;

      } catch (error) {

        console.error(
          '❌ Raffle creation error:',
          error
        );

        if (
          !interaction.replied
        ) {

          await interaction.reply({
            content:
              '❌ Something went wrong while creating the raffle.',

            ephemeral:
              true,
          });
        }

        return;
      }
    }

    // ==============================
    // ENTER RAFFLE BUTTON
    // ==============================

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        'raffle_enter_'
      )
    ) {

      const raffleId =
        interaction.customId.replace(
          'raffle_enter_',
          ''
        );

      const raffleData =
        loadRaffles();

      const raffle =
        raffleData.raffles[
          raffleId
        ];

      // ==============================
      // CHECK RAFFLE EXISTS
      // ==============================

      if (!raffle) {

        await interaction.reply({
          content:
            '❌ This raffle could not be found.',

          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // CHECK RAFFLE STATUS
      // ==============================

      if (
        raffle.status !==
        'active'
      ) {

        await interaction.reply({
          content:
            '❌ This raffle is no longer accepting entries.',

          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // CHECK RAFFLE END TIME
      // ==============================

      if (
        Date.now() >=
        raffle.endTime
      ) {

        await endRaffle(
          raffleId
        );

        await interaction.reply({
          content:
            '❌ This raffle has already ended.',

          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // CHECK DUPLICATE ENTRY
      // ==============================

      if (
        raffle.participants.includes(
          interaction.user.id
        )
      ) {

        await interaction.reply({
          content:
            '⚠️ You have already entered this raffle.',

          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // VERIFIED ROLE CHECK
      // ==============================

      const guildsData =
        loadGuilds();

      const guildSettings =
        guildsData.guilds[
          interaction.guildId
        ];

      if (
        !guildSettings ||
        !guildSettings.verifiedRoleId
      ) {

        await interaction.reply({
          content:
            '⚠️ This raffle server has not configured a Verified role yet. Please contact a server administrator.',

          ephemeral:
            true,
        });

        return;
      }

      const verifiedRoleId =
        guildSettings.verifiedRoleId;

      // ==============================
      // GET MEMBER
      // ==============================

      const member =
        await interaction.guild.members.fetch(
          interaction.user.id
        );

      // ==============================
      // CHECK VERIFIED ROLE
      // ==============================

      if (
        !member.roles.cache.has(
          verifiedRoleId
        )
      ) {

        await interaction.reply({
          content:
            '🔒 **Verification Required**\n\n' +
            'You must be verified in this server before you can enter this raffle.',

          ephemeral:
            true,
        });

        return;
      }

          const emailModal = new ModalBuilder()
        .setCustomId(`raffle_email_${raffleId}`)
        .setTitle('Enter Your Email');

      const emailInput = new TextInputBuilder()
        .setCustomId('raffle_email')
        .setLabel('Email address')
        .setPlaceholder('you@email.com')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      emailModal.addComponents(
        new ActionRowBuilder().addComponents(emailInput)
      );

      await interaction.showModal(emailModal);
      return;
    }

    // ==============================
    // SLASH COMMANDS
    // ==============================

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const command =
      client.commands.get(
        interaction.commandName
      );

    if (!command) {
      return;
    }

    // ==============================
    // MANUAL RAFFLE END
    // ==============================

    if (
      interaction.commandName ===
        'raffle' &&
      interaction.options.getSubcommand() ===
        'end'
    ) {

      const raffleId =
        interaction.options
          .getString(
            'raffle_id'
          )
          .trim()
          .toUpperCase();

      const raffleData =
        loadRaffles();

      const raffle =
        raffleData.raffles[
          raffleId
        ];

      if (!raffle) {

        await interaction.reply({
          content:
            `❌ Raffle **${raffleId}** could not be found.`,

          ephemeral:
            true,
        });

        return;
      }

      if (
        raffle.guildId !==
        interaction.guildId
      ) {

        await interaction.reply({
          content:
            '❌ You can only manage raffles created in this server.',

          ephemeral:
            true,
        });

        return;
      }

      if (
        raffle.status !==
        'active'
      ) {

        await interaction.reply({
          content:
            '⚠️ This raffle has already ended or is no longer active.',

          ephemeral:
            true,
        });

        return;
      }

      await interaction.reply({
        content:
          `🏁 Ending raffle **${raffleId}** and selecting winner(s)...`,

        ephemeral:
          true,
      });

      const ended =
        await endRaffle(
          raffleId
        );

      if (!ended) {

        await interaction.followUp({
          content:
            '⚠️ The raffle was ended, but there was a problem updating or announcing the results. Check the bot console.',

          ephemeral:
            true,
        });
      }

      return;
    }

    // ==============================
    // MANUAL RAFFLE CANCEL
    // ==============================

    if (
      interaction.commandName ===
        'raffle' &&
      interaction.options.getSubcommand() ===
        'cancel'
    ) {

      const raffleId =
        interaction.options
          .getString(
            'raffle_id'
          )
          .trim()
          .toUpperCase();

      const raffleData =
        loadRaffles();

      const raffle =
        raffleData.raffles[
          raffleId
        ];

      if (!raffle) {

        await interaction.reply({
          content:
            `❌ Raffle **${raffleId}** could not be found.`,

          ephemeral:
            true,
        });

        return;
      }

      if (
        raffle.guildId !==
        interaction.guildId
      ) {

        await interaction.reply({
          content:
            '❌ You can only manage raffles created in this server.',

          ephemeral:
            true,
        });

        return;
      }

      if (
        raffle.status !==
        'active'
      ) {

        await interaction.reply({
          content:
            '⚠️ This raffle has already ended, been cancelled, or is no longer active.',

          ephemeral:
            true,
        });

        return;
      }

      await interaction.reply({
        content:
          `🚫 Cancelling raffle **${raffleId}**...`,

        ephemeral:
          true,
      });

      const cancelled =
        await cancelRaffle(
          raffleId
        );

      if (!cancelled) {

        await interaction.followUp({
          content:
            '⚠️ The raffle cancellation could not be completed. Check the bot console.',

          ephemeral:
            true,
        });

      } else {

        await interaction.followUp({
          content:
            `✅ Raffle **${raffleId}** has been cancelled successfully.`,

          ephemeral:
            true,
        });
      }

      return;
    }

    // ==============================
    // PARTICIPANTS
    // ==============================

    if (
      interaction.commandName ===
        'raffle' &&
      interaction.options.getSubcommand() ===
        'participants'
    ) {

      const raffleId =
        interaction.options
          .getString(
            'raffle_id'
          )
          .trim()
          .toUpperCase();

      const raffleData =
        loadRaffles();

      const raffle =
        raffleData.raffles[
          raffleId
        ];

      // ==============================
      // CHECK RAFFLE EXISTS
      // ==============================

      if (!raffle) {

        await interaction.reply({
          content:
            `❌ Raffle **${raffleId}** could not be found.`,

          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // CHECK SERVER
      // ==============================

      if (
        raffle.guildId !==
        interaction.guildId
      ) {

        await interaction.reply({
          content:
            '❌ You can only view participants for raffles created in this server.',

          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // GET PARTICIPANTS
      // ==============================

      const participants =
        Array.isArray(
          raffle.participants
        )
          ? raffle.participants
          : [];

      // ==============================
      // NO PARTICIPANTS
      // ==============================

      if (
        participants.length === 0
      ) {

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `👥 ${raffle.title} — Participants`
              )
              .setDescription(
                'There are currently no participants in this raffle.'
              )
              .addFields(
                {
                  name:
                    '🆔 Raffle ID',
                  value:
                    raffleId,
                  inline:
                    true,
                },
                {
                  name:
                    '📊 Status',
                  value:
                    raffle.status,
                  inline:
                    true,
                },
                {
                  name:
                    '🎟️ Total Entries',
                  value:
                    '0',
                  inline:
                    true,
                }
              )
              .setFooter({
                text:
                  'Whitelist Raffle',
              })
              .setTimestamp(),
          ],
          ephemeral:
            true,
        });

        return;
      }

      // ==============================
      // FORMAT PARTICIPANTS
      // ==============================

      const participantMentions =
        participants.map(
          (userId, index) =>
            `${index + 1}. <@${userId}>`
        );

      // ==============================
      // DISCORD MESSAGE LIMIT
      // ==============================

      const chunks = [];

      let currentChunk = '';

      for (
        const participant of participantMentions
      ) {

        if (
          (currentChunk + participant + '\n').length > 1800
        ) {

          chunks.push(
            currentChunk.trim()
          );

          currentChunk = '';
        }

        currentChunk +=
          participant + '\n';
      }

      if (
        currentChunk.trim()
      ) {

        chunks.push(
          currentChunk.trim()
        );
      }

      // ==============================
      // SEND FIRST PAGE
      // ==============================

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              `👥 ${raffle.title} — Participants`
            )
            .setDescription(
              `**Raffle ID:** ${raffleId}\n` +
              `**Status:** ${raffle.status}\n` +
              `**Total Entries:** ${participants.length}`
            )
            .addFields({
              name:
                '👥 Participants',
              value:
                chunks[0],
              inline:
                false,
            })
            .setFooter({
              text:
                `Whitelist Raffle • Page 1 of ${chunks.length}`,
            })
            .setTimestamp(),
        ],
        ephemeral:
          true,
      });

      // ==============================
      // SEND ADDITIONAL PAGES
      // ==============================

      for (
        let i = 1;
        i < chunks.length;
        i++
      ) {

        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `👥 ${raffle.title} — Participants`
              )
              .addFields({
                name:
                  `👥 Participants — Page ${i + 1}`,
                value:
                  chunks[i],
                inline:
                  false,
              })
              .setFooter({
                text:
                  `Whitelist Raffle • Page ${i + 1} of ${chunks.length}`,
              })
              .setTimestamp(),
          ],
          ephemeral:
            true,
        });
      }

      return;
    }


        // ==============================
    // REROLL WINNER
    // ==============================

    if (
      interaction.commandName === 'raffle' &&
      interaction.options.getSubcommand() === 'reroll'
    ) {
      const raffleId = interaction.options
        .getString('raffle_id')
        .trim()
        .toUpperCase();

      const winnerNumber = interaction.options.getInteger('winner_number');
      const raffleData = loadRaffles();
      const raffle = raffleData.raffles[raffleId];

      if (!raffle) {
        await interaction.reply({
          content: `❌ Raffle **${raffleId}** could not be found.`,
          ephemeral: true,
        });
        return;
      }

      if (raffle.guildId !== interaction.guildId) {
        await interaction.reply({
          content: '❌ You can only reroll raffles created in this server.',
          ephemeral: true,
        });
        return;
      }

      if (raffle.status !== 'ended') {
        await interaction.reply({
          content: '⚠️ You can only reroll a raffle that has already ended.',
          ephemeral: true,
        });
        return;
      }

      if (!Array.isArray(raffle.winnersSelected) || raffle.winnersSelected.length === 0) {
        await interaction.reply({
          content: '❌ This raffle has no winners to reroll.',
          ephemeral: true,
        });
        return;
      }

      if (winnerNumber > raffle.winnersSelected.length) {
        await interaction.reply({
          content:
            `❌ Winner number must be between 1 and ${raffle.winnersSelected.length}.`,
          ephemeral: true,
        });
        return;
      }

      const oldWinnerId = raffle.winnersSelected[winnerNumber - 1];

      const remainingPool = raffle.participants.filter(
        (userId) =>
          userId !== oldWinnerId &&
          !raffle.winnersSelected.includes(userId)
      );

      if (remainingPool.length === 0) {
        await interaction.reply({
          content: '❌ There are no remaining participants to reroll with.',
          ephemeral: true,
        });
        return;
      }

      const newWinnerId =
        remainingPool[Math.floor(Math.random() * remainingPool.length)];

      raffle.winnersSelected[winnerNumber - 1] = newWinnerId;
      raffle.rerolls = raffle.rerolls || [];
      raffle.rerolls.push({
        winnerNumber,
        oldWinnerId,
        newWinnerId,
        rerolledBy: interaction.user.id,
        rerolledAt: Date.now(),
      });

      saveRaffles(raffleData);

      await interaction.reply({
        content:
          `✅ Winner #${winnerNumber} for **${raffleId}** has been rerolled.\n` +
          `Old winner: <@${oldWinnerId}>\n` +
          `New winner: <@${newWinnerId}>`,
        ephemeral: true,
      });

      try {
        const channel = await client.channels.fetch(raffle.channelId);

        if (channel) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle(`🔁 ${raffle.title} — Winner Rerolled`)
                .setDescription(`Winner #${winnerNumber} has been replaced.`)
                .addFields(
                  {
                    name: '🆔 Raffle ID',
                    value: raffleId,
                    inline: true,
                  },
                  {
                    name: '❌ Old Winner',
                    value: `<@${oldWinnerId}>`,
                    inline: true,
                  },
                  {
                    name: '🏆 New Winner',
                    value: `<@${newWinnerId}>`,
                    inline: true,
                  }
                )
                .setFooter({
                  text: 'Whitelist Raffle • Winner rerolled',
                })
                .setTimestamp(),
            ],
          });
        }
      } catch (error) {
        console.error(`⚠️ Could not announce reroll for ${raffleId}:`, error);
      }

      return;
    }

        if (
      interaction.commandName === 'raffle' &&
      interaction.options.getSubcommand() === 'export'
    ) {
      const raffleId = interaction.options
        .getString('raffle_id')
        .trim()
        .toUpperCase();

      const raffleData = loadRaffles();
      const raffle = raffleData.raffles[raffleId];

      if (!raffle) {
        await interaction.reply({
          content: `❌ Raffle **${raffleId}** could not be found.`,
          ephemeral: true,
        });
        return;
      }

      if (raffle.guildId !== interaction.guildId) {
        await interaction.reply({
          content: '❌ You can only export raffles from this server.',
          ephemeral: true,
        });
        return;
      }

      if (raffle.status !== 'ended') {
        await interaction.reply({
          content: '⚠️ You can export winners after the raffle has ended.',
          ephemeral: true,
        });
        return;
      }

      const emails = raffle.participantEmails || {};
      const winners = raffle.winnersSelected || [];

      if (winners.length === 0) {
        await interaction.reply({
          content: '❌ This raffle has no winners to export.',
          ephemeral: true,
        });
        return;
      }

      const lines = [
        `Raffle ID,${raffleId}`,
        `Title,${raffle.title}`,
        '',
        'Winner Number,Discord ID,Email',
      ];

      winners.forEach((userId, index) => {
        const email = emails[userId] || 'not provided';
        lines.push(`${index + 1},${userId},${email}`);
      });

      const file = new AttachmentBuilder(
        Buffer.from(lines.join('\n'), 'utf8'),
        { name: `${raffleId}-winners.csv` }
      );

      await interaction.reply({
        content: `📄 Winners export for **${raffleId}**`,
        files: [file],
        ephemeral: true,
      });
      return;
    }
    // ==============================
    // EXECUTE RAFFLE COMMAND
    // ==============================

    try {

      await command.execute(
        interaction
      );

    } catch (error) {

      console.error(
        '❌ Command error:',
        error
      );

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction.followUp({
          content:
            '❌ Something went wrong.',

          ephemeral:
            true,
        });

      } else {

        await interaction.reply({
          content:
            '❌ Something went wrong.',

          ephemeral:
            true,
        });
      }
    }
  }
);

// ==============================
// LOGIN
// ==============================

client.login(
  process.env.DISCORD_TOKEN
);