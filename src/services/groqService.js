const Groq = require('groq-sdk');

let _client = null;

function getClient() {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    _client = new Groq({ apiKey });
  }
  return _client;
}

/**
 * Generate an AI weekly recap blurb from match + fun stat data.
 * @param {Object} opts
 * @param {Array} opts.matches  - raw match rows from getWeeklyRecap
 * @param {Array} opts.topPerformers - top_performers rows
 * @param {Object} opts.fun - getFunRecapStats result
 * @returns {Promise<string|null>} AI-generated recap text, or null on failure
 */
async function generateWeeklyRecapBlurb({ matches, topPerformers, fun }) {
  const client = getClient();
  if (!client) return null;

  try {
    const radiantWins = matches.filter(m => m.radiant_win).length;
    const direWins = matches.length - radiantWins;
    const totalKills = matches.reduce((s, m) => s + (m.total_kills || 0), 0);
    const avgKills = matches.length > 0 ? Math.round(totalKills / matches.length) : 0;
    const totalDuration = matches.reduce((s, m) => s + (m.duration || 0), 0);
    const avgDurMins = matches.length > 0 ? Math.round(totalDuration / matches.length / 60) : 0;

    const mvpLine = topPerformers && topPerformers.length > 0
      ? `MVP of the week was ${topPerformers[0].player_name} with a ${parseFloat(topPerformers[0].avg_kda).toFixed(2)} KDA.`
      : '';

    const funFacts = [];
    if (fun?.most_kills?.player_name) funFacts.push(`${fun.most_kills.player_name} had the highest kill game (${fun.most_kills.kills} kills).`);
    if (fun?.most_deaths?.player_name) funFacts.push(`${fun.most_deaths.player_name} died the most in a single game (${fun.most_deaths.deaths} deaths).`);
    if (fun?.most_damage?.player_name) funFacts.push(`${fun.most_damage.player_name} dealt the most damage (${parseInt(fun.most_damage.hero_damage).toLocaleString()}).`);
    if (fun?.best_kda?.player_name) funFacts.push(`${fun.best_kda.player_name} had the best KDA ratio.`);
    if (fun?.most_assists?.player_name) funFacts.push(`${fun.most_assists.player_name} racked up the most assists (${fun.most_assists.assists}).`);

    const contextBlock = [
      `This week had ${matches.length} inhouse Dota 2 matches in the OCE community server.`,
      `Radiant won ${radiantWins} times, Dire won ${direWins} times.`,
      `Average game length was ${avgDurMins} minutes with about ${avgKills} kills per game.`,
      mvpLine,
      ...funFacts,
    ].filter(Boolean).join(' ');

    const prompt = [
      'You are the hype announcer for a competitive Dota 2 inhouse community.',
      'Write a short, entertaining weekly recap summary (3-4 sentences max) based on the stats below.',
      'Be colourful, use a bit of trash talk and humour, but keep it friendly.',
      'Do NOT use markdown headers or bullet points — plain prose only.',
      'Stats:',
      contextBlock,
    ].join('\n');

    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.85,
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[Groq] Weekly recap generation failed:', err.message);
    return null;
  }
}

module.exports = { generateWeeklyRecapBlurb };
