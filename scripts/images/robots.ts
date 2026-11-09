export function allowedByRobots(text: string, url: URL, agent = 'LongFishStudentProject') {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let group: typeof groups[number] | undefined;
  let hasRules = false;
  for (const line of text.split(/\r?\n/)) {
    const match = line.split('#')[0].trim().match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, field, value] = match;
    if (field.toLowerCase() === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && /^(allow|disallow)$/i.test(field)) {
      hasRules = true;
      if (value) group.rules.push({ allow: field.toLowerCase() === 'allow', path: value });
    }
  }
  const rank = (value: string) => value === '*' ? 0 : agent.toLowerCase().includes(value) ? value.length : -1;
  const weight = Math.max(-1, ...groups.flatMap(row => row.agents.map(rank)));
  const rules = groups.filter(row => row.agents.some(value => rank(value) === weight && weight >= 0)).flatMap(row => row.rules);
  const path = url.pathname + url.search;
  const matches = rules.filter(rule => {
    const pattern = rule.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + pattern).test(path);
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

