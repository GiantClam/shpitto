import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseRecoveryMonitorConfig} from '../../src/config/recovery-monitor.ts';

const input = {mode:'observe', projectId:'demo', expectedProjectId:'demo', profile:'acceptance', workspaceId:'fc130d11-5a78-4cf7-a257-e07ca6187716', workerKey:'provider-sweep', secret:'x'.repeat(64), appUrl:'https://demo.example.test', alertUrl:'https://demo.example.test/api/internal/recovery-alerts', databaseUrl:'postgres://test:fixture@postgres.railway.internal:5432/isolated'};
test('independent monitor only observes its explicitly isolated private database and recipient', () => {
  assert.equal(parseRecoveryMonitorConfig(input).mode,'observe');
  assert.equal(parseRecoveryMonitorConfig({...input,workerKey:'sweep.instance-1'}).workerKey,'sweep.instance-1');
  assert.equal(parseRecoveryMonitorConfig({...input,mode:'off',workspaceId:'',secret:'',databaseUrl:''}).mode,'off');
  for(const changes of [{mode:'active'},{projectId:'other'},{profile:'production'},{workspaceId:''},{workerKey:'bad/path'},{secret:'short'},{alertUrl:'https://outside.example.test/api/internal/recovery-alerts'},{databaseUrl:'postgres://test:fixture@localhost:5432/isolated'},{alertUrl:`${input.alertUrl}?token=x`}]) {
    assert.throws(()=>parseRecoveryMonitorConfig({...input,...changes}));
  }
});
