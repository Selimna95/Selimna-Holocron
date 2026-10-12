import { test, expect } from '@playwright/test';

test('charger un profil, ouvrir la Forge et vérifier les builds candidats', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await expect(page.locator('#log')).toContainText('Index des profils chargé', { timeout: 15000 });

  const kyberProfile = {
    character: 'Dark Trooper Moff Gideon',
    source: 'Fixture Playwright',
    averages: { Speed: 150, Health: 20000, Protection: 25000 },
    sets: [{ name: 'Offense', weight: 1 }],
    slots: {
      Square: { primaries: { 'Offense %': 1 } },
      Arrow: { primaries: { Speed: 1 } },
      Diamond: { primaries: { 'Defense %': 1 } },
      Triangle: { primaries: { 'Critical Damage': 1 } },
      Circle: { primaries: { 'Health %': 1 } },
      Cross: { primaries: { Potency: 1 } },
    },
    secondaries: [{ name: 'Offense %', weight: 20 }, { name: 'Health %', weight: 15 }],
    secondary_focus: { 'Offense %': 20, 'Health %': 15 },
  };
  const character = {
    name: 'Dark Trooper Moff Gideon', baseId: 'MOFFGIDEONS3', base_id: 'MOFFGIDEONS3',
    level: 85, gear: 13, relic_tier: 2, stars: 7, combatType: 1,
  };
  const mods = [
    { game_id: 'current-square', slot: 'Square', set_name: 'Offense', primary_stat: 'Offense %', primary_value: 5,
      secondary_1_stat: 'Speed', secondary_1_value: 10, secondary_2_stat: 'Potency', secondary_2_value: 3, level: 15, character: character.name },
    { game_id: 'candidate-square', slot: 'Square', set_name: 'Offense', primary_stat: 'Offense %', primary_value: 5,
      secondary_1_stat: 'Offense %', secondary_1_value: 5, secondary_2_stat: 'Health %', secondary_2_value: 4, level: 15, character: '' },
    ...[
      ['Arrow', 'Speed', 30], ['Diamond', 'Defense %', 5], ['Triangle', 'Critical Damage', 30],
      ['Circle', 'Health %', 5], ['Cross', 'Potency', 5],
    ].map(([slot, primary, value], index) => ({
      game_id: `current-${slot}`, slot, set_name: 'Offense', primary_stat: primary, primary_value: value,
      secondary_1_stat: 'Speed', secondary_1_value: 8 + index, secondary_2_stat: 'Health %', secondary_2_value: 3,
      level: 15, character: character.name,
    })),
  ];

  await page.evaluate(({ characterData, modData, profile }) => {
    window.__forgeFixture = { characterData, modData, profile };
    window.fetchKyberProfile = async () => window.__forgeFixture.profile;
    window.eval(`
      rosterCharacters = [window.__forgeFixture.characterData];
      rosterShips = [];
      mods = window.__forgeFixture.modData;
      currentData = { name: 'Fixture', characters: rosterCharacters, ships: [], mods };
      fillCharacters(rosterCharacters);
    `);
    document.querySelector('#optimizerAllRoster').checked = true;
  }, { characterData: character, modData: mods, profile: kyberProfile });

  await page.locator('[data-page="optimizer"]').click();
  await expect(page.locator('#optimizer')).toHaveClass(/active/);
  await page.locator('#runOptimizer').click();
  await expect(page.locator('#forgeSearchBtn')).toBeVisible({ timeout: 15000 });
  await page.locator('#forgeSearchBtn').click();
  await expect(page.locator('#forgeSearchResults .forge-candidate')).toHaveCount(1, { timeout: 10000 });
  await expect(page.locator('#forgeSearchResults')).toContainText('ARSENAL DISPONIBLE');
});
