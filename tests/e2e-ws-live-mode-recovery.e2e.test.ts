import { Agent } from '@credo-ts/core'
import { DidCommWsInboundTransport } from '@credo-ts/node'
import { WebSocketServer } from 'ws'
import { getAgentOptions, makeConnection } from '../packages/core/tests/helpers'
import {
  type DidCommMediationRecord,
  DidCommMediatorPickupStrategy,
  DidCommMessageForwardingStrategy,
  DidCommWsOutboundTransport,
} from '../packages/didcomm/src'

const mediatorPort = 4103
const senderPort = 4104

describe('E2E WS live mode recovery tests', () => {
  let mediatorSocketServer: WebSocketServer
  let mediatorAgent: Agent
  let senderAgent: Agent
  let recipientAgent: Agent

  beforeEach(async () => {
    mediatorSocketServer = new WebSocketServer({ port: mediatorPort })
    mediatorAgent = new Agent(
      getAgentOptions(
        'E2E WS Live Mode Recovery Mediator',
        {
          endpoints: [`ws://localhost:${mediatorPort}`],
          mediator: {
            autoAcceptMediationRequests: true,
            messageForwardingStrategy: DidCommMessageForwardingStrategy.QueueAndLiveModeDelivery,
          },
        },
        {},
        {},
        { requireDidcomm: true }
      )
    )
    mediatorAgent.didcomm.registerInboundTransport(new DidCommWsInboundTransport({ server: mediatorSocketServer }))
    mediatorAgent.didcomm.registerOutboundTransport(new DidCommWsOutboundTransport())
    await mediatorAgent.initialize()

    senderAgent = new Agent(
      getAgentOptions(
        'E2E WS Live Mode Recovery Sender',
        { endpoints: [`ws://localhost:${senderPort}`] },
        {},
        {},
        { requireDidcomm: true }
      )
    )
    senderAgent.didcomm.registerInboundTransport(new DidCommWsInboundTransport({ port: senderPort }))
    senderAgent.didcomm.registerOutboundTransport(new DidCommWsOutboundTransport())
    await senderAgent.initialize()

    recipientAgent = new Agent(
      getAgentOptions(
        'E2E WS Live Mode Recovery Recipient',
        { mediationRecipient: { mediatorPickupStrategy: DidCommMediatorPickupStrategy.PickUpV2LiveMode } },
        {},
        {},
        { requireDidcomm: true }
      )
    )
    recipientAgent.didcomm.registerOutboundTransport(new DidCommWsOutboundTransport())
    await recipientAgent.initialize()
  })

  afterEach(async () => {
    await recipientAgent?.shutdown()
    await mediatorAgent?.shutdown()
    await senderAgent?.shutdown()
  })

  async function requestMediation(): Promise<DidCommMediationRecord> {
    const [, recipientMediatorConnection] = await makeConnection(mediatorAgent, recipientAgent)
    const mediationRecord =
      await recipientAgent.didcomm.mediationRecipient.requestAndAwaitGrant(recipientMediatorConnection)
    await recipientAgent.didcomm.mediationRecipient.setDefaultMediator(mediationRecord)

    return mediationRecord
  }

  test('reconnects to the mediator when live mode cannot be set up on start', async () => {
    const mediationRecord = await requestMediation()

    vi.spyOn(recipientAgent.didcomm.messagePickup, 'pickupMessages').mockRejectedValueOnce(
      new Error('Timeout has occurred')
    )
    await expect(recipientAgent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)).rejects.toThrow(
      'Timeout has occurred'
    )

    await makeConnection(senderAgent, recipientAgent)
  })

  test('reconnects to the mediator again when live mode cannot be set up after a reconnect', async () => {
    const mediationRecord = await requestMediation()
    await recipientAgent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)

    const setLiveDeliveryMode = vi
      .spyOn(recipientAgent.didcomm.messagePickup, 'setLiveDeliveryMode')
      .mockRejectedValueOnce(new Error('Socket is not open'))
    for (const socket of mediatorSocketServer.clients) socket.close()
    await vi.waitFor(() => expect(setLiveDeliveryMode).toHaveBeenCalled(), { timeout: 10000 })

    await makeConnection(senderAgent, recipientAgent)
  })
})
