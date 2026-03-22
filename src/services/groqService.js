const { OpenAI } = require('openai');

let _client = null;

function getClient() {
  if (!_client) {
    const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    _client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
  }
  return _client;
}

async function ask(prompt, maxTokens = 200, temperature = 0.85) {
  const client = getClient();
  if (!client) return null;
  try {
    const completion = await client.chat.completions.create({
      model: 'grok-3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    });
    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[Grok] API call failed:', err.message);
    return null;
  }
}

/**
 * Generate an AI weekly recap blurb.
 */
async function generateWeeklyRecapBlurb({ matches, topPerformers, fun }) {
  if (!getClient()) return null;
  try {
    const radiantWins = matches.filter(m => m.radiant_win).length;
    const direWins = matches.length - radiantWins;
    const totalKills = matches.reduce((s, m) => s + (m.total_kills || 0), 0);
    const avgKills = matches.length > 0 ? Math.round(totalKills / matches.length) : 0;
    const totalDuration = matches.reduce((s, m) => s + (m.duration || 0), 0);
    const avgDurMins = matches.length > 0 ? Math.round(totalDuration / matches.length / 60) : 0;

    const mvpLine = topPerformers?.length > 0
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

    return await ask([
      'You are the hype announcer for a competitive Dota 2 inhouse community.',
      'Write a short, entertaining weekly recap summary (3-4 sentences max) based on the stats below.',
      'Be colourful, use a bit of trash talk and humour, but keep it friendly.',
      'Do NOT use markdown headers or bullet points — plain prose only.',
      'Stats:',
      contextBlock,
    ].join('\n'), 200, 0.85);
  } catch (err) {
    console.error('[Grok] Weekly recap generation failed:', err.message);
    return null;
  }
}

/**
 * Generate an AI performance analysis for a specific player.
 */
async function generatePlayerAnalysis({ name, avg, rating, recentHeroes }) {
  if (!getClient()) return null;
  try {
    const games = parseInt(avg.total_matches) || 0;
    const wins = rating?.wins || 0;
    const wr = games > 0 ? ((wins / games) * 100).toFixed(1) : '?';
    const kda = parseFloat(avg.avg_deaths) > 0
      ? ((parseFloat(avg.avg_kills) + parseFloat(avg.avg_assists)) / parseFloat(avg.avg_deaths)).toFixed(2)
      : 'perfect';
    const heroLine = recentHeroes?.length > 0
      ? `Their most played heroes are: ${recentHeroes.slice(0, 3).map(h => h.hero_name || 'Unknown').join(', ')}.`
      : '';

    const context = [
      `Player: ${name}`,
      `Games: ${games}, Win rate: ${wr}%, KDA: ${kda}`,
      `Avg GPM: ${avg.avg_gpm || '?'}, Avg damage: ${avg.avg_hero_damage ? parseInt(avg.avg_hero_damage).toLocaleString() : '?'}`,
      `Avg healing: ${avg.avg_hero_healing ? parseInt(avg.avg_hero_healing).toLocaleString() : '0'}`,
      `MMR: ${rating?.mmr || 2000}`,
      heroLine,
    ].filter(Boolean).join('\n');

    return await ask([
      'You are a Dota 2 coach analysing a player from an OCE inhouse community.',
      'Write a 3-4 sentence analysis of their performance based on the stats below.',
      'Comment on their strengths, areas to improve, and play style. Keep it insightful but light-hearted.',
      'Do NOT use bullet points — write flowing prose.',
      context,
    ].join('\n'), 220, 0.75);
  } catch (err) {
    console.error('[Grok] Player analysis failed:', err.message);
    return null;
  }
}

/**
 * Generate a friendly roast of a player based on their stats.
 */
async function generatePlayerRoast({ name, avg, rating, recentHeroes }) {
  if (!getClient()) return null;
  try {
    const games = parseInt(avg.total_matches) || 0;
    const wins = rating?.wins || 0;
    const losses = (rating?.losses) || games - wins;
    const wr = games > 0 ? ((wins / games) * 100).toFixed(1) : '?';
    const kda = parseFloat(avg.avg_deaths) > 0
      ? ((parseFloat(avg.avg_kills) + parseFloat(avg.avg_assists)) / parseFloat(avg.avg_deaths)).toFixed(2)
      : 'infinity';
    const heroLine = recentHeroes?.length > 0
      ? `They spam: ${recentHeroes.slice(0, 3).map(h => h.hero_name || 'Unknown').join(', ')}.`
      : '';

    const context = [
      `Player: ${name}`,
      `Record: ${wins}W ${losses}L (${wr}% win rate)`,
      `KDA ratio: ${kda}`,
      `Avg GPM: ${avg.avg_gpm || '?'}`,
      `Avg deaths: ${avg.avg_deaths || '?'}`,
      `MMR: ${rating?.mmr || 2000}`,
      heroLine,
    ].filter(Boolean).join('\n');

    return await ask([
      'You are a funny trash-talking commentator for a Dota 2 inhouse community.',
      `Write a savage but friendly roast of a player named ${name} based on their stats.`,
      '2-3 sentences max. Make it funny, creative, and specific to their stats.',
      'Do NOT use bullet points. Keep it playful — no genuine insults.',
      context,
    ].join('\n'), 160, 0.95);
  } catch (err) {
    console.error('[Grok] Player roast failed:', err.message);
    return null;
  }
}

/**
 * Generate a post-match MVP analysis blurb for the standout player.
 */
async function generateMatchMvpBlurb({ name, heroName, kills, deaths, assists, damage, gpm, team }) {
  if (!getClient()) return null;
  try {
    const context = [
      `${name} played ${heroName || 'Unknown'} for ${team}.`,
      `KDA: ${kills}/${deaths}/${assists}, GPM: ${gpm}, Damage: ${damage ? parseInt(damage).toLocaleString() : '?'}`,
    ].join(' ');

    return await ask([
      'You are a Dota 2 match commentator. Write ONE punchy sentence (max 20 words) hyping up the MVP performance.',
      'Be specific to the hero and stats. No bullet points.',
      context,
    ].join('\n'), 60, 0.9);
  } catch (err) {
    console.error('[Grok] MVP blurb failed:', err.message);
    return null;
  }
}

module.exports = {
  generateWeeklyRecapBlurb,
  generatePlayerAnalysis,
  generatePlayerRoast,
  generateMatchMvpBlurb,
};
