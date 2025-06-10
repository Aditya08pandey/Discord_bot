require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const pool = require("./db");
const { sendOTP } = require("./email");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

client.once("ready", () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});



client.on("messageCreate", (message) => {
  console.log("Message received:", message.content);
});


client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const [command, ...args] = message.content.split(" ");

  // Step 1: !verify user@example.com
  if (command === "!verify") {
    const email = args[0];

    if (!email || !email.includes("@")) {
      return message.reply("❌ Please provide a valid email.");
    }

    try {
      const allowed = await pool.query(
        "SELECT * FROM allowed_emails WHERE email = $1",
        [email]
      );

      if (allowed.rows.length === 0) {
        return message.reply("❌ This email is not authorized.");
      }

      const otp = generateOTP();
      const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

      await pool.query(
        "INSERT INTO users (discord_id, email, otp, otp_expires, verified) VALUES ($1, $2, $3, $4, false) ON CONFLICT (email) DO UPDATE SET otp = EXCLUDED.otp, otp_expires = EXCLUDED.otp_expires",
        [message.author.id, email, otp, expires]
      );

      await sendOTP(email, otp);
      message.reply("📧 OTP has been sent to your email. Use `!otp <code>` to verify.");
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Error sending OTP. Please try again later.");
    }
  }

  // Step 2: !otp 123456
  else if (command === "!otp") {
    const otp = args[0];
    if (!otp) return message.reply("❌ Please enter the OTP code.");

    try {
      const user = await pool.query(
        "SELECT * FROM users WHERE discord_id = $1 AND otp = $2 AND otp_expires > NOW()",
        [message.author.id, otp]
      );

      if (user.rows.length === 0) {
        return message.reply("❌ Invalid or expired OTP.");
      }

      await pool.query(
        "UPDATE users SET verified = true WHERE discord_id = $1",
        [message.author.id]
      );

      const guild = message.guild;
      const member = await guild.members.fetch(message.author.id);

      const verifiedRole = guild.roles.cache.find(
        (role) => role.name === "Member" || role.name === "@Member"
      );

      if (verifiedRole) {
        await member.roles.add(verifiedRole);
        message.reply("✅ Verification successful! You've been granted access.");
      } else {
        message.reply("✅ Verified, but no 'Member' role found to assign.");
      }
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Something went wrong. Try again later.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
