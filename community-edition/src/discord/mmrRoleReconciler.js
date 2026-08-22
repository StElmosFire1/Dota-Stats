function resolveLeaderDiscordId(leaderAccountId, registeredPlayers) {
  if (leaderAccountId == null) return null;
  const accountId = String(leaderAccountId);
  const player = (registeredPlayers || []).find(
    p => p.account_id_32 != null && String(p.account_id_32) === accountId
  );
  const discordId = player?.discord_id == null ? '' : String(player.discord_id).trim();
  return discordId || null;
}

async function reconcileExclusiveRole(role, targetMember = null) {
  if (!role?.id) return { removed: 0, added: false };
  let removed = 0;
  const holders = role.members?.values ? [...role.members.values()] : [];

  for (const holder of holders) {
    if (targetMember && holder.id === targetMember.id) continue;
    await holder.roles.remove(role.id);
    removed += 1;
  }

  let added = false;
  if (targetMember && !targetMember.roles.cache.has(role.id)) {
    await targetMember.roles.add(role.id);
    added = true;
  }
  return { removed, added };
}

module.exports = { resolveLeaderDiscordId, reconcileExclusiveRole };