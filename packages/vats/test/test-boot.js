// @ts-check
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import bundleSource from '@endo/bundle-source';
import { E, passStyleOf } from '@endo/far';

import { makeZoeKit } from '@agoric/zoe';
import { eventLoopIteration } from '@agoric/zoe/tools/eventLoopIteration.js';
import { buildRootObject as buildPSMRootObject } from '../src/core/boot-psm.js';
import { buildRootObject } from '../src/core/boot.js';
import { bridgeCoreEval } from '../src/core/chain-behaviors.js';
import { makePromiseSpace } from '../src/core/utils.js';
import { buildRootObject as boardRoot } from '../src/vat-board.js';

import {
  makeMock,
  mockDProxy,
  mockPsmBootstrapArgs,
  mockSwingsetVats,
} from '../tools/boot-test-utils.js';

const argvByRole = {
  chain: {
    ROLE: 'chain',
  },
  'sim-chain': {
    ROLE: 'sim-chain',
    FIXME_GCI: 'fake GCI',
    hardcodedClientAddresses: ['a1'],
  },
  client: {
    ROLE: 'client',
    FIXME_GCI: 'fake GCI',
    hardcodedClientAddresses: ['a1'],
  },
};
const testRole = (ROLE, governanceActions) => {
  test(`test manifest permits: ${ROLE} gov: ${governanceActions}`, async t => {
    const mock = makeMock(t.log);
    const root = buildRootObject(
      { D: mockDProxy, logger: t.log },
      {
        argv: argvByRole[ROLE],
        // @ts-expect-error XXX
        governanceActions,
      },
    );
    const vats = mockSwingsetVats(mock);
    const actual = await E(root).bootstrap(vats, mock.devices);
    t.deepEqual(actual, undefined);
  });
};

testRole('client', false);
testRole('chain', false);
testRole('chain', true);
testRole('sim-chain', false);
testRole('sim-chain', true);

test('evaluateInstallation is available to core eval', async t => {
  let handler;
  const modulePath = new URL('../src/core/utils.js', import.meta.url).pathname;
  const { produce, consume } = makePromiseSpace(t.log);

  const prepare = async () => {
    const bridgeManager = {
      register: (name, fn) => {
        handler = fn;
      },
    };

    const { zoeService } = makeZoeKit(makeFakeVatAdmin(() => {}).admin);

    const theBoard = boardRoot().getBoard();
    const bundle = await bundleSource(modulePath);

    const installation = await E(zoeService).install(bundle);
    const instId = await E(theBoard).getId(installation);

    produce.zoe.resolve(zoeService);
    produce.board.resolve(theBoard);
    produce.bridgeManager.resolve(bridgeManager);
    return instId;
  };

  const instId = await prepare();

  // @ts-expect-error
  await bridgeCoreEval({ produce, consume });
  t.truthy(handler);

  const produceThing = async ({
    consume: { board },
    produce: { thing },
    evaluateInstallation,
  }) => {
    const id = 'REPLACE_WITH_BOARD_ID';
    const inst = await E(board).getValue(id);
    const ns = await evaluateInstallation(inst);
    thing.resolve(ns);
  };

  const bridgeMessage = {
    type: 'CORE_EVAL',
    evals: [
      {
        json_permits: 'true',
        js_code: `${produceThing}`.replace('REPLACE_WITH_BOARD_ID', instId),
      },
    ],
  };
  t.log({ bridgeMessage });

  // @ts-expect-error
  await E(handler).fromBridge(bridgeMessage);
  const actual = await consume.thing;

  // @ts-expect-error
  t.deepEqual(typeof actual.extract, 'function');
});

test('bootstrap provides a way to pass items to CORE_EVAL', async t => {
  const root = buildRootObject(
    { D: mockDProxy, logger: t.log },
    {
      argv: argvByRole.chain,
      // @ts-expect-error XXX
      governanceActions: false,
    },
  );

  await E(root).produceItem('swissArmyKnife', [1, 2, 3]);
  t.deepEqual(await E(root).consumeItem('swissArmyKnife'), [1, 2, 3]);
  await E(root).resetItem('swissArmyKnife');
  await E(root).produceItem('swissArmyKnife', 4);
  t.deepEqual(await E(root).consumeItem('swissArmyKnife'), 4);
});

const psmParams = {
  anchorAssets: [{ denom: 'ibc/toyusdc' }],
  economicCommitteeAddresses: {},
  argv: { bootMsg: {} },
};

test(`PSM-only bootstrap`, async t => {
  const root = buildPSMRootObject({ D: mockDProxy, logger: t.log }, psmParams);

  void E(root).bootstrap(...mockPsmBootstrapArgs(t.log));
  await eventLoopIteration();

  const agoricNames =
    /** @type {Promise<import('../src/types.js').NameHub>} */ (
      E(root).consumeItem('agoricNames')
    );
  const instance = await E(agoricNames).lookup('instance', 'psm-IST-AUSD');
  t.is(passStyleOf(instance), 'remotable');
});

test('PSM-only bootstrap provides a way to pass items to CORE_EVAL', async t => {
  const root = buildPSMRootObject({ D: mockDProxy, logger: t.log }, psmParams);

  await E(root).produceItem('swissArmyKnife', [1, 2, 3]);
  t.deepEqual(await E(root).consumeItem('swissArmyKnife'), [1, 2, 3]);
  await E(root).resetItem('swissArmyKnife');
  await E(root).produceItem('swissArmyKnife', 4);
  t.deepEqual(await E(root).consumeItem('swissArmyKnife'), 4);
});
