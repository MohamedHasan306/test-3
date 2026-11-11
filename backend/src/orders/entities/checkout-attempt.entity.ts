import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('checkout_attempts')
@Index(['userId', 'requestKey'], { unique: true })
@Index(['state', 'retryAfter'])
export class CheckoutAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'request_key' })
  requestKey!: string;

  @Column({ name: 'items_hash', type: 'varchar', length: 64 })
  itemsHash!: string;

  @Column({ type: 'varchar', default: 'pending' })
  state!: 'pending' | 'completed' | 'closed';

  @Column({
    name: 'retry_after',
    type: 'timestamptz',
    default: () => "CURRENT_TIMESTAMP + INTERVAL '30 seconds'",
  })
  retryAfter!: Date;
}
