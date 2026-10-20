import type { AgentContext } from '@credo-ts/core'
import type { DidCommOutboundPackage } from '../types'

export interface DidCommOutboundTransport {
  supportedSchemes: string[]

  sendMessage(outboundPackage: DidCommOutboundPackage): Promise<void>

  closeSocketByConnectionId?(connectionId: string): void

  start(agentContext: AgentContext): Promise<void>
  stop(): Promise<void>
}
