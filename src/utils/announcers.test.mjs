import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAnnouncingCrew, NATIONAL_CREWS, TEAM_LOCAL_CREWS } from './announcers.ts'

test('resolveAnnouncingCrew matches ABC national crew', () => {
  const crew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['ABC'] }] })
  assert.equal(crew.network, 'ABC')
  assert.equal(crew.playByPlay, 'Mike Breen')
  assert.match(crew.colorAnalyst, /Doris Burke/)
  assert.equal(crew.sidelineReporter, 'Lisa Salters')
})

test('resolveAnnouncingCrew matches TNT national crew', () => {
  const crew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['TNT'] }] })
  assert.equal(crew.network, 'TNT Sports')
  assert.equal(crew.playByPlay, 'Kevin Harlan')
  assert.match(crew.colorAnalyst, /Reggie Miller/)
})

test('resolveAnnouncingCrew matches NBC national crew', () => {
  const crew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['NBC'] }] })
  assert.equal(crew.network, 'NBC Sports')
  assert.equal(crew.playByPlay, 'Noah Eagle')
})

test('resolveAnnouncingCrew resolves Boston Celtics local RSN crew', () => {
  const crew = resolveAnnouncingCrew({ broadcasts: [] }, 'BOS', 'DET')
  assert.equal(crew.network, 'NBC Sports Boston')
  assert.equal(crew.playByPlay, 'Drew Carter')
  assert.match(crew.colorAnalyst, /Brian Scalabrine/)
})

test('resolveAnnouncingCrew resolves New York Knicks MSG crew', () => {
  const crew = resolveAnnouncingCrew({ broadcasts: [] }, 'NYK', 'PHI')
  assert.equal(crew.network, 'MSG Network')
  assert.match(crew.playByPlay, /Mike Breen/)
  assert.match(crew.colorAnalyst, /Walt "Clyde" Frazier/)
})
