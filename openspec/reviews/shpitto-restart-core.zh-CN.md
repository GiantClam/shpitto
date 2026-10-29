# Shpitto 重启计划：身份、积分、生成与服务商完整审核稿

阶段评审统一遵循[完整验收制度](stage-acceptance.zh-CN.md)：必过条件、证据环境、独立复核与候选摘要失效规则适用于本分册全部任务，文档审核不构成功能通过。

日期：2026-09-27。状态：OpenSpec 提案审核内容；尚未实现、安装或运行应用测试。

本文件是四项核心能力的完整中文审核说明。规范性英文源文件位于对应 change 的 `specs/`；编号与中文逐项对应。所有任务均未勾选。文中测试、证据和门槛描述均指未来实施的完成条件，不代表现在已经通过。

以下属于补齐接口边界的**已选工程默认值**，不追认为此前逐条确认的商业政策：个人空间为创建者独占且不可转移；团队转移目标为现有有效且已验证成员；停用账户、暂停空间、账务冻结的效果矩阵。购买价格、退款商业资格和真实服务调用预算不在此文件代替用户决定。

## 身份与工作空间（identity-workspaces）

[对应英文规格](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md)。为买家部署的应用提供持久化身份和唯一的工作空间权限来源，使个人和团队账户正确隔离，并明确区分工作空间所有者与全局运营人员。

### REQ-IAM-01 持久化登录与可恢复的首次初始化

应用必须持久化账户和会话，并为每个已登录账户幂等建立一个个人工作空间。账户已建立但空间初始化失败时，应显示可恢复状态；重试不得重复建空间或重复发演示积分。生产模式不得发放本地演示积分。

追踪：D05、D18；J1、J7；T01、T05；G05、G18。实施任务：3.2、3.10、3.12。

#### SC-IAM-01 重启保留账户和空间

- **当**：用户登录、完成初始化并重启本地应用。
- **则**：原账户与个人空间仍可用，不需要云端凭据，不重复发放初始化积分。

#### SC-IAM-02 初始化中断可以重试

- **当**：账户建立后空间初始化失败，随后同时到达两次重试。
- **则**：用户可以继续初始化，最终只提交一个个人空间和最多一笔允许的演示积分。

### REQ-IAM-02 个人与团队所有权边界

应用必须区分个人空间与团队空间。个人空间的创建者始终是唯一且不可变更的所有者，拒绝邀请、转移所有权、退出、移除或降级操作。团队所有者可以管理邀请和成员；转移只能面向现有、有效且已验证的成员，并要求近期身份验证。并发修改不得导致团队没有所有者。个人空间及转移限制属于本次补齐角色契约的工程默认值。

追踪：D05；J7；T05、T05.a；G05。实施任务：3.3、3.5、4.13。

#### SC-IAM-03 个人空间拒绝团队操作

- **当**：个人所有者试图邀请他人、转移所有权或退出个人空间。
- **则**：操作被拒绝，界面提示创建独立团队空间开展协作，个人所有权保持不变。

#### SC-IAM-04 并发保护最后一位所有者

- **当**：两个请求并发尝试移除或降级团队最后的所有者，或向不合格对象转移。
- **则**：系统串行判断所有权，拒绝无所有者或目标不合格的结果，保留合法所有者。

### REQ-IAM-03 绑定身份的一次性邀请

团队邀请使用不可预测的一次性令牌，仅保存哈希，七天后到期；接受者必须是已验证、邮箱规范化后与邀请目标相符的账户。仅当前团队所有者可创建邀请。重复或重放接受不得重复成员关系；已提交邀请的邮件投递应可恢复。

追踪：D05、D15；J7；T05；G05、G15。实施任务：3.4、4.13。

#### SC-IAM-05 邀请只生效一次

- **当**：被邀请且已验证的用户重复或并发接受同一有效令牌。
- **则**：仅建立一条成员关系，后续接受不会增加关系或权限。

#### SC-IAM-06 拒绝过期或邮箱不符的邀请

- **当**：用户提交过期邀请，或提交绑定其他邮箱的令牌。
- **则**：拒绝接受，不泄漏团队私有记录，不建立成员关系。

### REQ-IAM-04 所有私有入口实时检查空间权限

每次私有查询和修改均须核对当前成员关系及资源所属空间。任务、积分、账单、资产和下载不得信任客户端当前空间、缓存角色或难以猜测的 ID。不可访问的跨空间资源返回不泄漏信息的响应。成员被移除后，即使会话仍有效，后续请求也必须拒绝；已签发下载链接仅允许在既定短期有效期内继续有效。

追踪：D05；J3、J5、J7；T02、T03；G05。实施任务：3.5、4.9、4.13。

#### SC-IAM-07 替换空间 ID 不能获得访问权

- **当**：W1 成员提交 W2 的任务、资产、下载、积分或账单 ID。
- **则**：服务端拒绝访问，响应不包含 W2 记录、余额或签名链接。

#### SC-IAM-08 有效会话中的成员移除立即约束新请求

- **当**：团队所有者移除了仍持有效会话的成员。
- **则**：该成员后续空间请求失败，不再签发下载链接；既有链接按原定短期有效期到期。

### REQ-IAM-05 独立的全局运营权限

全局运营必须依赖显式分配的 support/operator/superadmin 角色，与空间所有权独立。每次运营请求重新核对当前权限；特权命令还要求同一个有效会话在十分钟内通过可信服务端验证的第二因素。仅启用双因素功能不能视为完成增强验证。与运营模块共享这些身份控制，不另设身份权威库。

追踪：D22、D31；J7；T04、T59；G22、G31。实施任务：3.6。

#### SC-IAM-09 空间所有者不是全局管理员

- **当**：空间所有者请求后台路由，或运营角色在会话中被撤销。
- **则**：无论按钮是否显示或客户端权限是否缓存，服务端都拒绝无权或已撤权请求。

#### SC-IAM-10 增强验证绑定用户和当前会话

- **当**：特权命令只有已启用双因素标记、另一会话的验证记录，或超过十分钟的记录。
- **则**：拒绝命令，直至当前有效会话完成可信第二因素验证。

### REQ-IAM-06 账户停用、空间暂停和账务冻结的明确效果

作为工程默认值，停用账户后拒绝交互登录和当前会话操作，但不连带停止其他成员访问。空间暂停后拒绝成员读取、下载和新操作；允许经授权并留审计的运营读取，已有任务的后台交付与结算继续。账务冻结阻止新生成和新 Checkout，仍允许有权用户查看历史、下载、邀请、访问 Portal 与支持，并允许进行中任务结算。任何暂停或冻结均不得悄悄释放、消费或删除积分。

追踪：D05、D20、D22；J4、J5、J7；T03、T04、T23、T59、T59.a；G05、G20、G22。实施任务：3.7。

#### SC-IAM-11 停用一个账户不影响其他成员

- **当**：某个账户被停用，而其团队仍有其他成员且任务正在执行。
- **则**：停用账户的登录及会话操作失败，其他授权成员继续访问，运行中任务继续结算。

#### SC-IAM-12 区分空间暂停与账务冻结

- **当**：生成过程中空间被暂停或施加账务冻结。
- **则**：空间暂停拒绝成员读、下载和操作；账务冻结保留允许的读取、支持、Portal、邀请，阻止新生成和 Checkout；两者均保留后台结算与财务历史。

### REQ-IAM-07 会话 API 校验与安全数据契约

V1 私有接口通过已认证会话访问，使用经过校验的 DTO，修改操作具有同源及 CSRF 保护。不得宣称提供客户生成 API Key 或公共生成 API。业务命令幂等键须有长度范围并绑定语义。受保护数据不得进入浏览器模块。积分及货币数量在 JSON 中使用十进制字符串，货币值另带币种，错误响应不返回原始密钥或敏感上游内容。

追踪：D05、D08、D15；J3、J5、J7、J10；T02、T09、T57；G05、G08、G15。实施任务：3.8。

#### SC-IAM-13 拒绝未登录或来源伪造的修改

- **当**：未认证请求或不满足同源、CSRF 契约的请求尝试受保护修改。
- **则**：业务无变化，返回安全的身份或权限错误。

#### SC-IAM-14 校验数值表示与 API 产品边界

- **当**：内部 API 返回大额积分余额，或开发者查看 API 能力。
- **则**：数值用准确十进制字符串表示，文档中的会话接口不出现不可用的公共 API Key 功能。

## 积分记账（credit-accounting）

[对应英文规格](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md)。在并发提交、到期、取消、交付失败和运营对账过程中，保留可解释的空间积分批次、不可变分配来源和只生效一次的结算，并与真实货币收支分开。

### REQ-CRD-01 整数批次与不可变来源

积分域保存非负整数批次数量，发行量等于可用、预留、已消费、已到期和已作废之和。每次数量变化必须有不可变流水解释；分配记录保留原始来源、到期时间和来源链。真实货币支出与积分单位分开；关联批次、任务、分配和预留必须属于同一空间。

追踪：D05、D11、D12；J3、J5、J6；T06、T07、T08、T60；G05、G11、G12。实施任务：3.9。

#### SC-CRD-01 余额投影均可对账

- **当**：批次发生发行、预留、消费、到期或冲正。
- **则**：数量恒等式及非负约束成立，完整变化可由持久化不可变流水解释。

#### SC-CRD-02 来源链不得跨空间

- **当**：预留或资产、任务关联引用其他空间的积分批次。
- **则**：写入被拒绝，不留下部分流水、余额或任务变化。

### REQ-CRD-02 服务端报价与原子预留

生成请求受理时，从已启用且有版本的服务端目录取得不可变积分报价；输入授权、资金预留、任务建立、命令结果与派发意图一并提交。并发请求不得超额预留。旧版或停用目录要求刷新。事务重试最多三次，提交前不得调用生成服务。

追踪：D05、D12、D20；J3、J5；T06、T09、T12；G05、G12、G20。实施任务：3.10、4.1。

#### SC-CRD-03 并发预留不得超过余额

- **当**：两个并发请求各自需要同一空间可用余额的一半以上。
- **则**：仅资金足够的预留提交，失败请求不留下任务、扣减或派发副作用。

#### SC-CRD-04 客户端价格与旧目录不得改变记账

- **当**：客户端篡改显示价格，或提交报价后已停用的模型。
- **则**：服务端不信任价格字段，拒绝过期或停用请求，不调用上游，不留下部分预留。

### REQ-CRD-03 先到期先使用并保护进行中的预留

预留仅使用当前有效批次，按最早到期、创建时间、ID 排序，无到期购买积分排在最后。即使到期扫描尚未运行，过期未预留余额也不可再用。批次到期时，进行中任务保留原分配；方案或目录修改不得重定价已受理任务。

追踪：D12；J3、J5、J6；T07、T08；G12。实施任务：3.10、3.11。

#### SC-CRD-05 确定性的先到期顺序保留永久购买条款

- **当**：请求由有效订阅、补偿和永久购买批次提供积分。
- **则**：先分配最早到期批次，以确定性规则处理同期限；各分配保留原来源条款。

#### SC-CRD-06 到期不丢失预留

- **当**：订阅批次在部分积分已预留时到期，且到期扫描延迟。
- **则**：未使用部分不可新增消费，已预留部分仅用于所属任务的最终结算。

### REQ-CRD-04 业务幂等与原子证据

重复语义业务命令返回已提交结果，不重复任务、批次、预留或流水，不依赖队列或 Webhook 去重保留期。相同键对应不同语义内容必须冲突。必要的状态、流水、命令结果、审计与发件箱一起提交或一起回滚。

追踪：D12、D20、D22、D31；J3、J4、J7；T09、T12、T60、T61；G12、G20、G22、G31。实施任务：3.8、3.9、4.10。

#### SC-CRD-07 外部去重窗口结束后的重放

- **当**：已提交命令在队列去重窗口结束后再次到达。
- **则**：返回业务保存的结果，不再次预留或记账；不同内容复用键则拒绝。

#### SC-CRD-08 审计失败回滚特权修改

- **当**：特权积分命令中的必要审计或发件箱写入失败。
- **则**：状态、流水和命令结果全部回滚，不能保留未审计的成功调整。

### REQ-CRD-05 取消与成功交付的结算

派发前取消只释放一次预留；仍有效部分恢复可用，按原条款已过期的部分记为到期；取消不产生失败补偿。只有已验证的持久化可用视频存在时才可消费预留。取消、交付和失败共用唯一终态积分边界。

追踪：D13、D20；J3、J4；T09、T10、T13、T14、T19；G13、G20。实施任务：4.2、4.8。

#### SC-CRD-09 取消已到期分配不产生补偿

- **当**：分配订阅批次已到期，但任务尚未取得派发权时被取消。
- **则**：有效部分恢复，已到期部分保持到期，不发行七天补偿。

#### SC-CRD-10 仅持久化交付才消费积分

- **当**：上游报告成功，但持久资产缺失或无效，随后重复报告交付。
- **则**：验证持久交付前不消费预留，验证后最多消费一次。

### REQ-CRD-06 按原条款完整退还失败交付积分

没有交付可用视频的终态失败必须按来源及到期条款退还全部分配积分，也包含有时限的不可恢复交付失败。有效订阅和补偿保留原期限，购买积分永久有效；上游货币成本独立留存，不得减少积分退款。混合来源逐笔处理。

追踪：D20、D21；J4、J6；T15、T18、T53；G20、G21。实施任务：3.11、4.3。

#### SC-CRD-11 上游收费不减少失败退款

- **当**：上游产生真实费用，但任务没有交付可用视频并最终失败。
- **则**：全部分配按完整退款规则处理，上游成本作为独立已知或未知证据记录。

#### SC-CRD-12 混合来源失败保留各自条款

- **当**：失败任务使用过期订阅、有效订阅、有效补偿和购买积分。
- **则**：仅过期订阅分配产生允许的补偿，其他金额保留原期限或永久性。

### REQ-CRD-07 仅一次且不可滚动延长的七天补偿

过期订阅分配在失败结算时，每笔最多产生一次补偿，期限严格为退款时间后七天，并关联原始来源。该补偿日后退款时保留原到期时间；已到期补偿不得再次可用，也不得生成新的延长期。

追踪：D21；J6；T16、T17、T18、T53；G21。实施任务：3.11、4.3。

#### SC-CRD-13 恰好一次七天补偿

- **当**：任务包含一百个过期订阅积分且失败事件重复到达。
- **则**：只发行一次一百个补偿积分，到期时间为退款时间后七天，保留原分配关联。

#### SC-CRD-14 再次失败不能延长补偿

- **当**：补偿积分支付的任务在补偿原期限前或后失败。
- **则**：退款保留同一到期时间；已到期金额仍到期，不开启新的补偿周期。

### REQ-CRD-08 可解释余额与安全对账

应用展示可用、预留、来源和到期信息，并可查看分配与流水来源。对账发现差异时报告并冻结受影响命令，不能悄悄重写历史。授权修正通过新批次或补偿流水实现，只能撤销可用且未预留的金额；更复杂恢复案件保留现有任务结算。

追踪：D12、D20、D22；J5、J6、J7；T07、T08、T49、T61；G12、G20、G22。实施任务：3.11、4.11。

#### SC-CRD-15 用户可理解混合退款

- **当**：用户在混合来源失败或到期后查看积分。
- **则**：显示金额、来源链和期限，明确可再次使用部分与已到期补偿，不把所有退款说成永久可用。

#### SC-CRD-16 差异不得悄悄改历史

- **当**：对账发现批次数量投影与不可变流水不符。
- **则**：差异可见，相关命令冻结；修复必须是授权补偿操作，不能修改历史条目。

## 生成生命周期与资产（generation-lifecycle）

[对应英文规格](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md)。提供持久化且按空间授权的视频生成流程，在崩溃、提交结果不明、任务丢失及事件延迟或冲突时，仍确保派发、取消、资产所有权及积分结果正确。

### REQ-GEN-01 持久化的本地完整生成流程

无云端模式使用与生产一致的持久化业务规则，保存身份、空间、积分记录、任务和本地自有资产。可编排 Mock 支持成功、失败、延迟、提交不明和重复、乱序观察。重启不能丢弃已受理工作。演示能力必须明确标记，不能作为真实服务商或支付验收证据。

追踪：D18、D15；J1、J3、J4；T01、T12；G18、G15。实施任务：4.4、4.5、4.12。

#### SC-GEN-01 本地流程经重启仍保持

- **当**：没有云端密钥的买家登录、生成 Mock 视频并重启网页和后台进程。
- **则**：任务、积分及资产保留，授权视频仍可下载。

#### SC-GEN-02 Mock 故障经过真实业务状态转换

- **当**：Mock 在重启前后产生延迟、失败或重复观察。
- **则**：持久化业务执行与真实适配器一致的恢复及幂等规则，同时不声称完成真实服务商验证。

### REQ-GEN-02 取消与付费派发的原子竞争

排队任务只能在首个持久化派发认领之前取消。认领与取消在同一原子边界竞争。写入 dispatching 后，即使网络请求尚未发出，也拒绝取消。重复认领或执行租约过期不得获得第二次付费提交权。

追踪：D13、D20；J3、J4；T10、T11、T12；G13、G20。实施任务：4.2、4.6。

#### SC-GEN-03 取消赢得派发竞争

- **当**：取消在任何派发认领前提交。
- **则**：任务变为已取消，预留只释放一次，不提交上游。

#### SC-GEN-04 尚未联网但派发已赢得竞争

- **当**：派发认领已提交，而取消在后台发送 HTTP 请求之前到达。
- **则**：取消返回状态冲突，持久化尝试仍是唯一首次提交尝试。

### REQ-GEN-03 单调状态与可用交付才算成功

任务按守卫条件在 queued、dispatching、submission_unknown、submitted、running、materializing 以及 succeeded/failed/cancelled 终态间转换。队列结束不能替代合法上游结果。成功必须同时有可用的私有持久化视频和就绪资产记录。失败结算遵循积分规则。

追踪：D03、D20；J3、J4；T13、T14、T20；G03、G20。实施任务：4.1、4.3、4.8。

#### SC-GEN-05 队列结束但结果错误不算成功

- **当**：适配器观察到队列完成，但结果含错误或无可用视频。
- **则**：任务不成功、不消费预留，进入相应恢复或失败流程。

#### SC-GEN-06 自有持久资产是成功边界

- **当**：上游已有输出，但复制或校验尚未完成。
- **则**：任务保持 materializing，直到自有持久对象及对应就绪记录齐备后，只结算一次成功。

### REQ-GEN-04 提交不明时有期限恢复且不盲目重试

派发认领后发生超时、丢失响应或崩溃，须保留结果不明的尝试，不自动再次付费提交。提交超时为三十秒。未知结果恢复以派发后六十分钟及最多二十四次探测为界，三十分钟提醒运营。仅准确且认证的请求或回调证据可关联；提示词或时间相似不构成证据。耗尽后记录有审计的不可恢复交付失败，按来源完整退款，即使上游成本仍未知。

追踪：D13、D20、D21；J4、J6；T11、T12、T20、T53；G13、G20、G21。实施任务：4.6、5.4。

#### SC-GEN-07 丢失响应不会第二次付费创建

- **当**：上游可能已收到请求，但没有可信请求 ID 返回。
- **则**：原尝试标记未知，只进行安全恢复，不自动发送第二次付费创建。

#### SC-GEN-08 不可追踪结果按时释放用户积分

- **当**：未知恢复预算耗尽时仍不能取得准确请求 ID 或合法关联回调。
- **则**：任务记为不可恢复失败，退款一次并按条件提供七天补偿，上游未知成本留给运营处理。

### REQ-GEN-05 独立扫描与硬期限

每个非终态任务记录受理时的不可变恢复预算、待办时间及期限。排队派发十分钟；已知请求执行从派发起六十分钟；资产复制从首次认证成功起三十分钟、最多八次，且不晚于派发后九十分钟。恢复扫描独立于原任务，生产每分钟、本地每十秒读取任务状态。重试不重置期限。数据库或执行平台整体中断恢复后，先处理过期结算，再推进状态；不承诺整体中断期间仍能运行。

追踪：D18、D20；J3、J4；T12、T14、T20、T49、T53、T12.a；G18、G20、G22。实施任务：4.7、5.6。

#### SC-GEN-09 任务丢失不得永久占用预留

- **当**：原执行任务消失、进入死信或重试耗尽，而业务任务尚未终结。
- **则**：独立扫描只恢复安全工作，或按正常唯一退款流程结束过期任务，不依赖丢失的执行任务。

#### SC-GEN-10 期限与成功只能有一个赢家

- **当**：成功完成与超时失败竞争，或服务在期限后恢复。
- **则**：仅一个匹配活动版本的终态变化提交；过期任务先结算，重试不能延长受理时预算。

### REQ-GEN-06 持久化收发件箱与受保护租约

已提交工作通过持久化发件箱承受调度失败，已认证观察通过去重收件箱承受处理失败。后台租约六十秒到期、每二十秒续期，并精确比对所有者、令牌和递增代次。旧后台进程不得确认或覆盖新租约。重新认领 dispatching 或 unknown 工作只能对账原尝试，不能获得新的付费创建权。

追踪：D15、D18、D20；J3、J4；T09、T12、T19、T20、T12.b；G15、G18、G20。实施任务：4.5、4.10、5.5。

#### SC-GEN-11 调度与处理崩溃后恢复

- **当**：进程在业务提交后调度前停止，或在收件箱接收后处理前停止。
- **则**：后续后台进程恢复已提交记录，重复投递不产生重复业务效果。

#### SC-GEN-12 旧后台进程不能确认新租约

- **当**：后台 A 失去租约，B 取得更高代次后，A 延迟确认或写进度。
- **则**：拒绝 A 的旧所有者、令牌、代次操作，B 的租约及状态保持完整。

### REQ-GEN-07 迟到观察不得改变已结算终态

终态任务收到迟到或冲突的上游结果时，须隔离保存证据供有权运营检查。不得重新打开任务、再次付费提交、悄悄重新扣款或二次退款。安全恢复操作使用同一终态守卫及审计契约。

追踪：D20、D21、D22；J4、J6、J7；T19、T49、T53；G20、G21、G22。实施任务：4.3、4.10、5.4。

#### SC-GEN-13 退款后的迟到成功被隔离

- **当**：上游在任务已失败且积分已退款后报告成功。
- **则**：隔离结果证据，失败结果不变，不新增扣减、退款或自动重提。

#### SC-GEN-14 冲突重复不能绕过终态守卫

- **当**：运营恢复命令或重复回调尝试不兼容的终态更新。
- **则**：保留已记录终态，显示冲突，不改变财务结果。

### REQ-GEN-08 授权安全输入与输出持久化

生成仅接受就绪自有输入资产，不接受浏览器任意 URL 或任意上游参数。图片限 JPEG、PNG、WebP，最多 20 MiB、4096×4096 像素或模型更严限制，依据真实解码校验。输出只从经验证 HTTPS 上游地址取得，重查跳转及 DNS，阻止内网、本地链路地址及 URL 凭据，流式上限 250 MiB，并执行有边界的媒体验证。不安全或无效内容不得成为就绪资产。

追踪：D03、D05、D20；J3、J4；T02、T13、T14；G03、G05、G20。实施任务：4.8、5.7。

#### SC-GEN-15 拒绝不安全输入及输出地址

- **当**：输入伪造 MIME、解码尺寸超限、归属他人，或结果地址跳转至内网。
- **则**：校验拒绝，不进行未授权抓取或交付，任务按定义的恢复或失败规则处理。

#### SC-GEN-16 对象与记录完成流程可恢复

- **当**：输出复制被中断，或对象上传成功后数据库完成操作失败。
- **则**：不提前显示成功；安全重试核对确定性对象身份及完整性，只完成一次，或按保留策略清理孤立对象。

### REQ-GEN-09 私有下载及有边界的资产生命周期

就绪输出保持私有，签发六十秒下载链接前检查当前空间权限。供上游读取的输入链接另设有效期，初始两小时。本地路径必须位于配置卷内，拒绝路径穿越及符号链接。未完成上传一小时到期，孤立对象至少等待二十四小时清理。就绪输出保留至授权删除，并遵守已公布存储条款；正在使用的任务输入不得删除。空间所有者或资产创建者可申请删除。

追踪：D05、D18、D20；J1、J3、J7；T01、T02、T03、T14；G05、G18、G20。实施任务：4.9、5.7。

#### SC-GEN-17 签发时授权私有下载

- **当**：当前成员取得就绪资产链接后被移除，再请求第二个链接。
- **则**：原链接最迟六十秒到期，第二次请求被拒绝，永不暴露永久存储凭据。

#### SC-GEN-18 删除与清理保留活动引用

- **当**：所有者或创建者请求删除活动任务使用的输入，或清理发现新近孤立对象。
- **则**：拒绝删除活动输入，孤立对象等待二十四小时恢复窗口，不破坏运行中任务。

### REQ-GEN-10 真实进度与可操作恢复证据

任务界面从持久状态恢复，区分未知、复制中、失败和已交付，终态停止轮询。运营证据关联空间、任务、尝试、事件、命令及版本，不包含密钥或签名链接。未知时长、后台心跳、发件箱延迟及积分差异应可观察。恢复工具只能调用授权业务命令，不直接改余额或任务状态。

追踪：D18、D20、D22；J3、J4、J7；T01、T20、T49；G18、G20、G22。实施任务：4.11、5.8、5.9。

#### SC-GEN-19 页面重返后显示业务状态

- **当**：用户重新加载或返回任务，而执行平台任务已超时。
- **则**：界面显示持久化恢复状态，不能把执行平台超时直接当作交付成功或失败。

#### SC-GEN-20 恢复演练保留关联且不泄密

- **当**：队列任务阻塞、未知提交超时增长，或扫描心跳超过三分钟。
- **则**：运营获得可关联可处理证据和业务命令恢复路径，不泄密、不重复花费、不直接修改状态。

## 真实视频服务商集成（provider-integrations）

[对应英文规格](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md)。通过已选两家服务商真实实现文生视频及图生视频，以版本化契约、认证结果和自有持久输出提供能力，同时确保服务商适配器不拥有积分结算权。

### REQ-PRV-01 四个已选真实服务商与模式契约

发行版必须提供四个真实接口：Replicate 的 wan-video/wan-2.2-t2v-fast，固定版本 c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d；wan-video/wan-2.2-i2v-fast，固定版本 4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea；fal-ai/wan/v2.2-a14b/text-to-video；fal-ai/wan/v2.2-a14b/image-to-video。保留已检查 schema 与摘要，不把可变 fal 端点宣称为不可变模型构建。Mock 不能替代任一行证据。

追踪：D03、D10；J3；T13、T14、T53；G03、G10。实施任务：5.1、5.2、5.3、5.10。

#### SC-PRV-01 四行均产出自有视频

- **当**：使用已授权账户资源和合法输入逐一运行服务商及模式。
- **则**：每行记录确切契约、请求 ID、可用持久化下载视频和积分结果；缺任一行则真实服务商门槛未完成。

#### SC-PRV-02 契约漂移必须明确处理

- **当**：固定 Replicate 版本不可用，或 fal schema 摘要变化。
- **则**：该能力等待有证据的契约审查，不能悄悄切换模型或版本。

### REQ-PRV-02 受控共享预设与自有图片裁切确认

初始预设为 720p、81 帧、16 fps，画幅 16:9 或 9:16；按所选契约启用安全检查，关闭插帧和提示词扩写。时长表述为约五秒，以成品测量为准。图生视频显示裁切效果并确认后使用已授权、标准化的自有图片；固定 Replicate I2V 请求不得发送其不支持的 aspect_ratio 字段。拒绝任意客户端 URL、LoRA、尾帧输入。

追踪：D03、D10；J3；T02、T13；G03、G10。实施任务：5.1、5.2、5.3。

#### SC-PRV-03 图片画幅通过确认裁切实现

- **当**：用户为 Replicate 图生视频选择 9:16。
- **则**：用户确认标准化自有图片裁切，适配器传递图片链接且不发送不支持的 aspect_ratio，输出尺寸与时长实测。

#### SC-PRV-04 未批准参数不能传给上游

- **当**：请求包含外部图片 URL 或目录 DTO 之外的任意服务商字段。
- **则**：预留及提交前拒绝请求，始终以已记录安全预设为准。

### REQ-PRV-03 统一的服务商观察接口

适配器通过唯一共享契约提供 capabilities、validate、submit、getStatus、readResult、verifyWebhook。submit 区分 accepted(requestId)、definitelyRejected 与 unknown；状态及结果区分排队、运行、可用结果与失败。适配器不得直接修改流水或独立结算任务。派发前持久化端点、schema、输入摘要及尝试 nonce；调度后续工作前保存可信上游 ID。

追踪：D03、D10、D15、D20；J3、J4；T11、T12、T13、T20；G03、G10、G15、G20。实施任务：5.1、5.2、5.3、5.4。

#### SC-PRV-05 不同上游状态安全归一化

- **当**：Replicate 或 fal 返回受理 ID、队列结束但结果出错，或传输结果不明。
- **则**：适配器返回正确归一化观察，仅业务命令决定状态及积分效果。

#### SC-PRV-06 配置变化不重解释已有任务

- **当**：运营在已受理任务恢复期间修改未来模型配置。
- **则**：已有任务保留其端点、schema、输入及策略快照，不重新解释受理价格或上游请求。

### REQ-PRV-04 按服务商真实方式验证回调

Replicate 根据原始字节，用账户 HMAC-SHA256 签名密钥及 webhook-id、timestamp、signature 头校验，时间容差三百秒。fal 对其规定的签名值及正文摘要使用 ED25519 和可信 JWKS 校验，密钥缓存最多二十四小时，时间容差三百秒，并匹配预期账户用户 ID。两者均匹配已认证服务商、请求及尝试，响应确认前写入去重收件箱。仅 nonce 不能认证回调。

追踪：D03、D10、D20；J3、J4；T09、T19、T22、T53；G03、G10、G20。实施任务：5.4。

#### SC-PRV-07 拒绝伪造、过期或错误账户回调

- **当**：回调签名错误、时间过期、账户不符或请求与尝试关联冲突。
- **则**：在记录可信观察、推进任务或影响流水之前拒绝。

#### SC-PRV-08 认证回调持久且可安全重放

- **当**：有效签名回调重复到达，处理器在收件箱确认后崩溃。
- **则**：持久记录支持恢复处理，保留终态规则，不重复积分效果。

### REQ-PRV-05 禁用付费创建重试并精确恢复

付费提交禁用 SDK 与 HTTP 自动重试，fal 使用 X-Fal-No-Retry: 1 禁用平台重试。不得默认所选端点有创建幂等性或缺失 ID 搜索功能。恢复在生成预算内使用认证的准确 ID 或已验证回调。Trigger 重试仅恢复安全状态和结果查询，不重复创建。任何端点级幂等例外须先有独立审查证据。

追踪：D10、D13、D20；J4；T11、T12、T20、T53；G10、G13、G20。实施任务：5.2、5.3、5.5、5.6。

#### SC-PRV-09 执行器重试不产生重复上游费用

- **当**：Trigger 在提交超时或确认丢失后重试。
- **则**：持久化尝试进入安全恢复，不发送第二个创建请求。

#### SC-PRV-10 缺失 ID 时相似性不证明归属

- **当**：查询发现提示词或时间类似记录，但不能精确关联服务商及尝试。
- **则**：该结果不能附到本任务，继续执行有时限的未知结果规则。

### REQ-PRV-06 持久输出与真实集成证据

上游临时 URL 在成功前经共享安全资产流程复制。归一化 Replicate output URI 与 fal video.url，不能把它们作为永久交付。真实服务商验收逐行记录契约、实际账户请求、自有下载、积分结果和限制。固定样例、缺预算或账户能力不可用必须明确标识，不能报告为通过真实集成。

追踪：D03、D10、D19、D20；J3、J4、J9；T13、T14、T15、T48、T49；G03、G10、G19、G20。实施任务：5.7、5.8、5.9、5.10。

#### SC-PRV-11 上游地址到期不能算永久交付

- **当**：有效上游链接在复制中断期间到期。
- **则**：在有边界复制策略内尝试受支持的权威刷新，或最终失败退款，绝不把临时链接标记持久交付成功。

#### SC-PRV-12 缺少付费真实证据不能过门槛

- **当**：实现已有通过的固定样例，但缺真实服务商授权资源或某一模式运行记录。
- **则**：报告区分样例证据及被阻塞的真实行，M4、G03、G10 保持未完成。

## 实施任务：M2—M4

目标路径均为拟新增应用结构；现在文件未必存在。依赖按编号执行，M4 可在 M3 门槛通过后与 M5 并行；共享 schema 和契约由集成负责人统一管理。每个任务的英文正式清单最终以 change 根目录的 `tasks.md` 为准。

### 3. M2：身份、工作空间与积分

- [ ] **3.1 建立已审查的身份、业务迁移与样例基础**
  - 目标文件或模块：`src/db/schema/auth.ts`、`src/db/schema/workspace.ts`、`src/db/migrations/**`、`tests/fixtures/workspaces.ts`。
  - 前置依赖：2.8。
  - 完成条件：固定 ID、跨表空间约束、UTC 与十进制字符串约定；单一 Drizzle 迁移应用于可丢弃 PostgreSQL；提供 A/B/C、W1/W2 样例及迁移恢复边界。
  - 验收证据：T02、T05、T60；[SC-IAM-02](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-02-interrupted-setup-is-retryable)、[SC-CRD-02](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-02-tenant-lineage-cannot-cross-workspaces)。

- [ ] **3.2 集成持久化 Better Auth 与初始化的账户、空间阶段**
  - 目标文件或模块：`src/lib/auth.ts`、`src/modules/workspaces/onboard.ts`、`src/app/(auth)/**`、`tests/integration/onboarding.test.ts`。
  - 前置依赖：3.1。
  - 完成条件：使用已选库实现注册、会话、验证、重置；账户或空间阶段未完成时可以恢复；重启及并发重试后只有一个个人空间。本阶段不发放演示积分；保存可恢复的待发放状态，等 3.10 接入流水支持的发放命令。完整初始化场景在 3.12 关闭。
  - 验收证据：T01、T05；[SC-IAM-01](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-01-restart-preserves-account-and-workspace)、[SC-IAM-02](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-02-interrupted-setup-is-retryable)。

- [ ] **3.3 实现个人与团队所有权命令**
  - 目标文件或模块：`src/modules/workspaces/commands.ts`、`src/modules/workspaces/policy.ts`、`src/app/api/workspaces/**`、`tests/integration/workspace-ownership.test.ts`。
  - 前置依赖：3.2。
  - 完成条件：个人所有权不可变，协作用团队空间；转移要求已有有效且已验证成员及近期身份验证；并发移除、降级、转移不得产生无所有者团队。
  - 验收证据：T05、T05.a；[SC-IAM-03](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-03-personal-workspace-rejects-team-operations)、[SC-IAM-04](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection)。

- [ ] **3.4 实现一次性邮箱绑定邀请与持久邮件意图**
  - 目标文件或模块：`src/modules/workspaces/invitations.ts`、`src/adapters/mail/**`、`src/app/api/invitations/accept/route.ts`、`tests/integration/invitations.test.ts`。
  - 前置依赖：3.3。
  - 完成条件：持久化七天令牌哈希，仅所有者创建，仅匹配已验证邮箱接受，并提交邮件意图；重复、过期、邮箱不符场景均安全。
  - 验收证据：T05；[SC-IAM-05](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-05-accept-invitation-exactly-once)、[SC-IAM-06](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-06-reject-expired-or-mismatched-invitation)。

- [ ] **3.5 集中实现租户入口的实时成员授权**
  - 目标文件或模块：`src/modules/workspaces/authorize.ts`、`src/app/api/workspaces/**`、`tests/integration/tenant-authorization.test.ts`。
  - 前置依赖：3.3、3.4。
  - 完成条件：对目前所有登记入口实施空间及资源校验，并供后续模块复用；拒绝替换 W2 ID、移除后仍有效会话的请求，验证最后所有者竞争。
  - 验收证据：T02、T03、T05.a；[SC-IAM-04](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection)、[SC-IAM-07](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access)、[SC-IAM-08](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-08-removal-takes-effect-during-an-active-session)。

- [ ] **3.6 实现独立运营角色与可信会话增强验证**
  - 目标文件或模块：`src/db/schema/operator.ts`、`src/modules/operations/authorize.ts`、`src/lib/auth.ts`、`src/app/api/admin/me/route.ts`。
  - 前置依赖：3.2、3.5。
  - 完成条件：保存显式全局角色及服务端建立的第二因素成功记录；要求同一有效会话和十分钟内有效；拒绝空间所有者越权，撤权立即生效；具体后台页面属于 M6。
  - 验收证据：T04、T59；[SC-IAM-09](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-09-workspace-ownership-is-not-global-administration)、[SC-IAM-10](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-10-step-up-binds-user-and-live-session)。

- [ ] **3.7 落实账户停用、空间暂停与账务冻结矩阵**
  - 目标文件或模块：`src/modules/workspaces/access-state.ts`、`src/modules/operations/status-commands.ts`、`src/modules/billing/hold-policy.ts`、`tests/integration/access-states.test.ts`。
  - 前置依赖：3.5、3.6。
  - 完成条件：用统一策略实现工程默认值：停用个人不影响队友；暂停空间拒绝成员读取下载；账务冻结在原有授权内阻止新生成及 Checkout，保留允许操作；相关冻结均不阻断后台已有任务结算。
  - 验收证据：T03、T04、T23、T59、T59.a；[SC-IAM-11](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-11-disable-one-account-without-harming-other-members)、[SC-IAM-12](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-12-suspension-and-billing-hold-have-different-effects)。

- [ ] **3.8 实现会话 DTO 校验与持久业务命令身份**
  - 目标文件或模块：`src/contracts/http.ts`、`src/modules/shared/commands.ts`、`src/db/schema/commands.ts`、`src/app/api/**`。
  - 前置依赖：3.1、3.5。
  - 完成条件：实现安全响应、错误格式、有限长度幂等键及语义摘要、同源与 CSRF、整数十进制字符串、持久命令重放；拒绝不同内容复用键，不引入公共 API Key 页面。
  - 验收证据：T02、T09、T57；[SC-IAM-13](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-13-reject-unauthenticated-or-forged-origin-mutations)、[SC-IAM-14](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-14-validate-quantities-and-api-product-boundary)、[SC-CRD-07](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-07-replay-after-external-deduplication-expires)。

- [ ] **3.9 实现批次流水、分配来源与原子审计基础**
  - 目标文件或模块：`src/db/schema/credit.ts`、`src/modules/credits/ledger.ts`、`src/modules/shared/transaction.ts`、`tests/integration/credit-ledger.test.ts`。
  - 前置依赖：3.1、3.8。
  - 完成条件：强制数量恒等非负、空间关联、流水及分配不可变、业务唯一键及账户串行锁；注入流水、审计或发件箱失败时整条命令回滚。
  - 验收证据：T06、T07、T09、T60、T61；[SC-CRD-01](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-01-every-balance-projection-reconciles)、[SC-CRD-02](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-02-tenant-lineage-cannot-cross-workspaces)、[SC-CRD-08](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-08-audit-failure-rolls-back-the-privileged-mutation)。

- [ ] **3.10 实现服务端报价、原子预留、先到期分配与本地初始化发放**
  - 目标文件或模块：`src/config/models.ts`、`src/modules/credits/reserve.ts`、`src/modules/credits/allocate.ts`、`src/modules/credits/issue-demo.ts`、`src/modules/workspaces/complete-onboarding.ts`、`tests/integration/credit-reservation.test.ts`、`tests/integration/onboarding.test.ts`。
  - 前置依赖：3.7、3.9。
  - 完成条件：不可变服务端报价、按到期/创建/ID 排序、即时排除过期未预留金额、最多三次事务重试；并发余额不足与旧目录场景不发生外部调用。3.8 与 3.9 完成后，用按空间固定业务键、带环境保护的积分发放命令继续本地待发放初始化；崩溃或并发重试最多发放一次允许的演示积分，生产模式拒绝演示积分。
  - 初始化验收证据：T01、T05；[SC-IAM-01](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-01-restart-preserves-account-and-workspace)、[SC-IAM-02](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-02-interrupted-setup-is-retryable)。
  - 验收证据：T06、T07、T08、T09；[SC-CRD-03](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-03-concurrent-reservations-cannot-exceed-funds)、[SC-CRD-04](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-04-client-price-and-stale-catalog-do-not-bind-the-ledger)、[SC-CRD-05](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-05-deterministic-fefo-preserves-permanent-purchases)、[SC-CRD-06](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-06-expiry-does-not-discard-a-reservation)。

- [ ] **3.11 实现到期退款、不滚动补偿及余额查询**
  - 目标文件或模块：`src/modules/credits/settle.ts`、`src/modules/credits/expiry.ts`、`src/modules/credits/queries.ts`、`tests/integration/credit-refund.test.ts`。
  - 前置依赖：3.9、3.10。
  - 完成条件：受控时钟证明按来源取消及失败结算、每笔过期订阅分配仅一次七天补偿、补偿期限不延长；提供可解释的来源到期余额与差异冻结。
  - 验收证据：T07、T08、T15、T16、T17、T18、T49；[SC-CRD-09](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-09-cancelled-expired-allocation-is-not-compensation)、[SC-CRD-11](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-11-provider-charge-does-not-reduce-a-failure-refund)、[SC-CRD-12](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-12-mixed-source-failure-preserves-each-source)、[SC-CRD-13](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-13-exactly-one-seven-day-compensation-grant)、[SC-CRD-14](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-14-compensation-cannot-renew-through-another-failure)、[SC-CRD-15](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-15-user-can-explain-a-mixed-refund)、[SC-CRD-16](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-16-mismatch-never-silently-repairs-history)。

- [ ] **3.12 完成 M2 身份与积分不变量验收门槛**
  - 目标文件或模块：`internal/evidence/M2/**`、`tests/integration/**`、`tests/unit/credits/**`。
  - 前置依赖：3.2、3.3、3.4、3.5、3.6、3.7、3.8、3.9、3.10、3.11。
  - 完成条件：收集新的可丢弃 PostgreSQL 权限、竞争、流水、审计及业务覆盖证据；在重启与并发重试条件下重放完整的账户、个人空间、允许的演示积分初始化，证明空间和积分均不重复，生产不发演示积分。适用 IAM/CRD 场景与强制金额、隔离场景均通过，自有核心业务分支覆盖率至少以 80% 为目标，后续集成场景明确登记。M2 不代表服务商、账单或后台页面已完成。
  - 验收证据：T01、T02、T03、T04、T05、T06、T07、T08、T09、T16、T17、T18、T59、T60；[SC-IAM-01](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-01-restart-preserves-account-and-workspace)、[SC-IAM-04](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection)、[SC-IAM-07](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access)、[SC-IAM-10](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-10-step-up-binds-user-and-live-session)、[SC-IAM-12](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-12-suspension-and-billing-hold-have-different-effects)、[SC-CRD-03](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-03-concurrent-reservations-cannot-exceed-funds)、[SC-CRD-08](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-08-audit-failure-rolls-back-the-privileged-mutation)、[SC-CRD-13](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-13-exactly-one-seven-day-compensation-grant)、[SC-CRD-14](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-14-compensation-cannot-renew-through-another-failure)。

### 4. M3：持久化本地生成

- [ ] **4.1 实现任务契约、状态守卫与原子创建**
  - 目标文件或模块：`src/db/schema/generation.ts`、`src/modules/generation/create.ts`、`src/modules/generation/state.ts`、`src/app/api/workspaces/[w]/generations/**`。
  - 前置依赖：3.12。
  - 完成条件：一起保存受理输入、目录、策略快照及任务、预留、命令、发件箱；落实合法非法状态转换；仅服务端报价、授权就绪输入及允许访问状态可创建任务。
  - 验收证据：T06、T09、T13、T20；[SC-CRD-03](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-03-concurrent-reservations-cannot-exceed-funds)、[SC-CRD-04](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-04-client-price-and-stale-catalog-do-not-bind-the-ledger)、[SC-GEN-05](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-05-queue-completion-with-error-is-not-success)、[SC-GEN-06](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary)。

- [ ] **4.2 实现排队取消与唯一派发认领**
  - 目标文件或模块：`src/modules/generation/cancel.ts`、`src/modules/generation/claim-dispatch.ts`、`tests/integration/cancel-dispatch.test.ts`。
  - 前置依赖：4.1。
  - 完成条件：真实 PostgreSQL 中取消与认领只能有一个赢家；认领在 HTTP 前禁止取消，仅产生一条尝试和独立于服务商的派发身份；取消仅恢复有效分配，不产生补偿。
  - 验收证据：T09、T10、T11；[SC-GEN-03](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-03-cancel-wins-the-dispatch-race)、[SC-GEN-04](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-04-dispatch-wins-before-network-transmission)、[SC-CRD-09](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-09-cancelled-expired-allocation-is-not-compensation)。

- [ ] **4.3 实现成功、失败终态与迟到结果隔离**
  - 目标文件或模块：`src/modules/generation/settle.ts`、`src/modules/generation/quarantine.ts`、`tests/integration/generation-settlement.test.ts`。
  - 前置依赖：4.1、3.11。
  - 完成条件：成功要求持久就绪输出，失败按原来源退款，上游未知成本独立记录；重放及终态冲突不得重开、再扣、二次退款或重提。
  - 验收证据：T09、T13、T15、T16、T17、T18、T19、T53；[SC-CRD-10](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-10-only-durable-delivery-consumes)、[SC-CRD-11](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-11-provider-charge-does-not-reduce-a-failure-refund)、[SC-CRD-13](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-13-exactly-one-seven-day-compensation-grant)、[SC-CRD-14](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-14-compensation-cannot-renew-through-another-failure)、[SC-GEN-13](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined)、[SC-GEN-14](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-14-conflicting-duplicate-cannot-bypass-terminal-guard)。

- [ ] **4.4 实现可编排持久化 Mock 样例**
  - 目标文件或模块：`src/adapters/providers/mock/**`、`tests/fixtures/video/**`、`tests/fixtures/provider-scripts.ts`。
  - 前置依赖：4.1。
  - 完成条件：提供可合法再分发的本地视频图片样例及成功、失败、延迟、未知、重放脚本；选择的场景跨重启保持，使用共享归一化观察，并明确仅供演示。
  - 验收证据：T01、T11、T12、T13；[SC-GEN-01](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-01-local-journey-survives-a-restart)、[SC-GEN-02](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-02-mock-faults-exercise-real-domain-transitions)。

- [ ] **4.5 实现持久本地后台、收发件箱及受保护租约**
  - 目标文件或模块：`src/modules/generation/outbox.ts`、`src/modules/generation/inbox.ts`、`scripts/local-worker.ts`、`src/adapters/tasks/local.ts`。
  - 前置依赖：4.2、4.4。
  - 完成条件：有界批次轮询持久工作；六十秒租约、二十秒心跳精确比较所有者/令牌/代次；调度或接收崩溃后恢复，旧确认被拒绝。
  - 验收证据：T09、T12、T12.b、T20；[SC-GEN-02](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-02-mock-faults-exercise-real-domain-transitions)、[SC-GEN-11](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-11-scheduling-and-processing-crashes-recover)、[SC-GEN-12](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease)。

- [ ] **4.6 实现未知尝试恢复且不重放付费创建**
  - 目标文件或模块：`src/modules/generation/dispatch.ts`、`src/modules/generation/reconcile.ts`、`tests/integration/unknown-submission.test.ts`。
  - 前置依赖：4.2、4.3、4.5。
  - 完成条件：三十秒提交超时进入未知；关联需精确服务商或回调证据；丢失 ID 场景不发送第二个创建；六十分钟或二十四次预算耗尽后正确失败与补偿。
  - 验收证据：T11、T12、T20、T53；[SC-GEN-07](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-07-lost-response-never-triggers-a-second-paid-create)、[SC-GEN-08](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time)。

- [ ] **4.7 实现独立期限扫描及终态版本保护**
  - 目标文件或模块：`src/modules/generation/sweep-recovery.ts`、`src/db/schema/generation.ts`、`scripts/local-worker.ts`、`tests/integration/recovery-sweep.test.ts`。
  - 前置依赖：4.3、4.5、4.6。
  - 完成条件：本地每十秒独立扫描有索引的任务期限，不依赖发件箱健康；落实 10/60/30/90 分钟及八次复制预算，用数据库时间裁定终态；恢复服务先结算过期任务。
  - 验收证据：T12.a、T14、T20、T49、T53；[SC-GEN-09](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-09-lost-job-does-not-strand-reservation)、[SC-GEN-10](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner)。

- [ ] **4.8 实现本地自有资产复制与有边界媒体验证**
  - 目标文件或模块：`src/modules/assets/ingest.ts`、`src/adapters/storage/local.ts`、`src/modules/assets/media-probe.ts`、`docker/local-worker.Dockerfile`。
  - 前置依赖：4.3、4.4。
  - 完成条件：有界解码输入图片；输出限量流式写入确定性私有键；就绪前校验字节、摘要、容器、视频、时长与完整性；ffprobe 固定 execFile 参数、仅本地不透明路径、十五秒超时、限制输出且禁用网络协议；可恢复上传后数据库失败。
  - 验收证据：T12、T13、T14；[SC-CRD-10](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-10-only-durable-delivery-consumes)、[SC-GEN-06](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary)、[SC-GEN-15](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-15-reject-unsafe-inputs-and-output-locations)、[SC-GEN-16](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-16-object-and-metadata-finalization-are-recoverable)。

- [ ] **4.9 实现授权上传、下载与删除接口**
  - 目标文件或模块：`src/app/api/workspaces/[w]/assets/**`、`src/modules/assets/authorize.ts`、`src/modules/assets/cleanup.ts`、`tests/integration/assets.test.ts`。
  - 前置依赖：4.8、3.5、3.7。
  - 完成条件：资产及六十秒下载链接检查当前成员；拒绝本地路径穿越、符号链接、不安全图片、他人输入 ID；拒绝删活动输入；遵守未完成上传一小时、孤立对象二十四小时规则。
  - 验收证据：T01、T02、T03、T14；[SC-IAM-07](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access)、[SC-IAM-08](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-08-removal-takes-effect-during-an-active-session)、[SC-GEN-15](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-15-reject-unsafe-inputs-and-output-locations)、[SC-GEN-17](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-17-private-download-is-authorized-at-issuance)、[SC-GEN-18](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-18-deletion-and-cleanup-preserve-active-references)。

- [ ] **4.10 验证崩溃边界、旧租约及并发终态**
  - 目标文件或模块：`tests/integration/generation-crash.test.ts`、`tests/integration/outbox-fencing.test.ts`、`tests/integration/terminal-races.test.ts`。
  - 前置依赖：4.2、4.3、4.5、4.6、4.7、4.8、4.9。
  - 完成条件：在预留、认领、接收、上传后及结算前注入中断；覆盖丢失任务、并发扫描、旧确认和期限瞬间成功；断言业务积分效果唯一，不重复获得付费派发权。
  - 验收证据：T09、T10、T11、T12、T12.a、T12.b、T19、T53、T60；[SC-CRD-07](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-07-replay-after-external-deduplication-expires)、[SC-CRD-08](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-08-audit-failure-rolls-back-the-privileged-mutation)、[SC-GEN-09](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-09-lost-job-does-not-strand-reservation)、[SC-GEN-10](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner)、[SC-GEN-11](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-11-scheduling-and-processing-crashes-recover)、[SC-GEN-12](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease)、[SC-GEN-13](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined)、[SC-GEN-14](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-14-conflicting-duplicate-cannot-bypass-terminal-guard)。

- [ ] **4.11 完成本地空间界面与无密钥恢复信号**
  - 目标文件或模块：`src/app/(app)/**`、`src/modules/credits/queries.ts`、`src/modules/operations/telemetry.ts`、`internal/runbooks/local-recovery.md`。
  - 前置依赖：4.7、4.9、3.11。
  - 完成条件：空间切换、报价提交、未知/复制中/历史、取消、资产下载、来源期限积分均接真实本地命令；活动/后台三秒/十秒轮询，终态停止；关联恢复证据、差异及心跳提醒不含密钥。
  - 验收证据：T01、T07、T08、T20、T49；[SC-CRD-15](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-15-user-can-explain-a-mixed-refund)、[SC-CRD-16](../changes/restart-shpitto-video-saas/specs/credit-accounting/spec.md#scenario-sc-crd-16-mismatch-never-silently-repairs-history)、[SC-GEN-19](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-19-progress-reflects-domain-state-after-navigation)、[SC-GEN-20](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-20-recovery-drill-remains-correlated-and-secret-free)。

- [ ] **4.13 实现团队创建、成员管理与所有权产品界面**
  - 目标文件或模块：`src/app/(app)/workspaces/new/page.tsx`、`src/app/(app)/workspaces/[w]/settings/members/page.tsx`、`src/app/(auth)/invitations/accept/page.tsx`、`src/components/workspaces/ownership-transfer.tsx`、`tests/e2e/workspace-membership.spec.ts`。
  - 前置依赖：3.3、3.4、3.5、3.7、4.11。
  - 完成条件：团队创建、邀请创建与接受、成员列表与移除、所有权转移全部接入真实业务命令。浏览器流程证明所有者与成员权限、有近期身份验证的合格成员转移、邀请重放与过期、个人空间禁止操作，以及成员被移除后已打开页面的后续请求立即拒绝；权限仍以服务端为准。为保留已有编号，本任务放在不变的 4.12 门槛之前。
  - 验收证据：T02、T03、T05、T05.a；[SC-IAM-03](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-03-personal-workspace-rejects-team-operations)、[SC-IAM-04](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-04-concurrent-last-owner-protection)、[SC-IAM-05](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-05-accept-invitation-exactly-once)、[SC-IAM-06](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-06-reject-expired-or-mismatched-invitation)、[SC-IAM-07](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-07-cross-workspace-ids-do-not-grant-access)、[SC-IAM-08](../changes/restart-shpitto-video-saas/specs/identity-workspaces/spec.md#scenario-sc-iam-08-removal-takes-effect-during-an-active-session)。

- [ ] **4.12 完成 M3 持久化本地完整流程验收门槛**
  - 目标文件或模块：`internal/evidence/M3/**`、`tests/e2e/local-demo.spec.ts`、`tests/integration/**`。
  - 前置依赖：4.1、4.2、4.3、4.4、4.5、4.6、4.7、4.8、4.9、4.10、4.11、4.13。
  - 完成条件：全新无云端本地运行完成登录、空间、Mock、持久下载，并涵盖重启、取消、失败、混合到期及未知耗尽；4.13 的所有者与成员浏览器流程覆盖团队创建、邀请、移除、转移、个人空间限制与移除后拒绝。适用 IAM/CRD/GEN 场景均通过。固定共享生成、积分及资产契约，供 M4/M5 并行；准确标记 Mock 证据。
  - 验收证据：T01、T02、T03、T09、T10、T12、T13、T14、T15、T16、T17、T18、T19、T20、T49、T53；[SC-GEN-01](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-01-local-journey-survives-a-restart)、[SC-GEN-03](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-03-cancel-wins-the-dispatch-race)、[SC-GEN-06](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary)、[SC-GEN-08](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time)、[SC-GEN-10](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner)、[SC-GEN-12](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease)、[SC-GEN-13](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined)、[SC-GEN-17](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-17-private-download-is-authorized-at-issuance)、[SC-GEN-19](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-19-progress-reflects-domain-state-after-navigation)。

### 5. M4：真实服务商与持久执行

- [ ] **5.1 固定共享服务商接口与四个版本化模型契约**
  - 目标文件或模块：`src/adapters/providers/port.ts`、`src/config/models.ts`、`internal/contracts/providers/**`、`tests/contracts/provider-inputs.test.ts`。
  - 前置依赖：4.12。
  - 完成条件：唯一定义六项服务商操作；固定端点、版本、schema 摘要、客户端 DTO、安全预设、报价及期限快照、自有图片裁切确认；不虚构幂等或不可变构建保证。
  - 验收证据：T02、T11、T13、T20；[SC-PRV-02](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-02-contract-drift-is-explicit)、[SC-PRV-03](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-03-image-ratio-is-realized-through-approved-crop)、[SC-PRV-04](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-04-unapproved-parameters-do-not-reach-providers)、[SC-PRV-05](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-05-different-provider-vocabularies-normalize-safely)、[SC-PRV-06](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-06-persisted-contract-survives-configuration-changes)。

- [ ] **5.2 实现固定版本 Replicate 文生及图生适配器**
  - 目标文件或模块：`src/adapters/providers/replicate/**`、`tests/contracts/replicate.test.ts`。
  - 前置依赖：5.1。
  - 完成条件：用固定 prediction 版本及安全输入映射提交；I2V 传 image 且不传不支持的 aspect_ratio；保存 prediction ID，归一化 output URI 及失败，禁用创建自动重试，证明丢失响应行为。
  - 验收证据：T11、T12、T13、T20；[SC-PRV-01](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-01-all-four-rows-produce-owned-video)、[SC-PRV-03](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-03-image-ratio-is-realized-through-approved-crop)、[SC-PRV-05](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-05-different-provider-vocabularies-normalize-safely)、[SC-PRV-09](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend)。

- [ ] **5.3 实现 fal 队列文生及图生适配器**
  - 目标文件或模块：`src/adapters/providers/fal/**`、`tests/contracts/fal.test.ts`。
  - 前置依赖：5.1。
  - 完成条件：使用已选队列端点、X-Fal-No-Retry: 1、持久请求 ID 及经过校验的跟踪来源；归一化 video.url，区分队列 COMPLETED 与实际成功；不虚构缺失 ID 查询。
  - 验收证据：T11、T12、T13、T20；[SC-PRV-01](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-01-all-four-rows-produce-owned-video)、[SC-PRV-04](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-04-unapproved-parameters-do-not-reach-providers)、[SC-PRV-05](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-05-different-provider-vocabularies-normalize-safely)、[SC-PRV-09](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend)、[SC-PRV-10](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-10-missing-id-similarity-is-not-ownership-evidence)。

- [ ] **5.4 实现各服务商原始正文回调校验与关联恢复**
  - 目标文件或模块：`src/app/api/webhooks/replicate/[attemptNonce]/route.ts`、`src/app/api/webhooks/fal/[attemptNonce]/route.ts`、`src/adapters/providers/*/webhook.ts`、`tests/contracts/provider-webhooks.test.ts`。
  - 前置依赖：5.2、5.3。
  - 完成条件：实现真实 Replicate HMAC 与 fal ED25519、JWKS、账户和时间校验，保留原始字节并精确关联 nonce 与请求；持久收件箱确认先于处理；伪造、过期、错误账户、重放、迟到事件保持终态规则。
  - 验收证据：T09、T19、T22、T53；[SC-PRV-07](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-07-reject-forged-stale-or-wrong-account-observations)、[SC-PRV-08](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-08-authenticated-callback-is-durable-and-replay-safe)、[SC-GEN-07](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-07-lost-response-never-triggers-a-second-paid-create)、[SC-GEN-08](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time)、[SC-GEN-13](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined)。

- [ ] **5.5 接入 Trigger 派发、发件箱扫描与租约恢复任务**
  - 目标文件或模块：`src/adapters/tasks/trigger.ts`、`trigger/dispatch.ts`、`trigger/reconcile.ts`、`trigger/outbox.ts`。
  - 前置依赖：5.2、5.3、5.4。
  - 完成条件：轻量 Trigger 入口用持久 ID 调用共享业务命令；每分钟发件箱扫描补偿调度遗漏；重试及过期租约只恢复安全对账，不产生另一次付费提交。
  - 验收证据：T09、T11、T12、T12.b、T20；[SC-GEN-11](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-11-scheduling-and-processing-crashes-recover)、[SC-GEN-12](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease)、[SC-PRV-09](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend)。

- [ ] **5.6 部署独立生产恢复扫描及维护命令**
  - 目标文件或模块：`trigger/sweep-recovery.ts`、`scripts/reconcile-overdue.ts`、`src/modules/generation/sweep-recovery.ts`、`internal/runbooks/generation-recovery.md`。
  - 前置依赖：5.5。
  - 完成条件：每分钟定时扫描读取权威任务期限，即使原执行缺失或死信；认证维护命令调用同一扫描；心跳超过三分钟提醒；旧租约、并发扫描及中断恢复均保持唯一终态效果。
  - 验收证据：T12.a、T12.b、T20、T49、T53；[SC-GEN-09](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-09-lost-job-does-not-strand-reservation)、[SC-GEN-10](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner)、[SC-GEN-20](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-20-recovery-drill-remains-correlated-and-secret-free)、[SC-PRV-09](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend)。

- [ ] **5.7 集成私有 S3/R2 输出复制与后台媒体工具**
  - 目标文件或模块：`src/adapters/storage/s3.ts`、`trigger/materialize.ts`、`trigger.config.ts`、`src/modules/assets/**`。
  - 前置依赖：5.4、5.5。
  - 完成条件：实现有限 HTTPS、DNS、跳转安全抓取及确定性私有上传，执行 HEAD、摘要、媒体验证；打包所选探测工具并记录版本、哈希、声明；输出到期、重复复制、孤立对象恢复遵守三十分钟八次预算。
  - 验收证据：T02、T12、T13、T14；[SC-GEN-15](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-15-reject-unsafe-inputs-and-output-locations)、[SC-GEN-16](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-16-object-and-metadata-finalization-are-recoverable)、[SC-GEN-17](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-17-private-download-is-authorized-at-issuance)、[SC-GEN-18](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-18-deletion-and-cleanup-preserve-active-references)、[SC-PRV-11](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-11-expiring-provider-output-is-not-permanent-delivery)。

- [ ] **5.8 接入生产能力健康、脱敏指标与恢复手册**
  - 目标文件或模块：`src/modules/operations/integration-health.ts`、`src/modules/operations/telemetry.ts`、`internal/runbooks/provider-operations.md`、`src/app/(app)/**`。
  - 前置依赖：5.6、5.7。
  - 完成条件：关联任务、尝试、服务商及成本证据；未知三十分钟、发件箱五分钟、扫描心跳三分钟触发提醒；服务商中断只降低相应能力，登录与历史仍可用；支持采用授权安全命令。
  - 验收证据：T15、T20、T49；[SC-GEN-19](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-19-progress-reflects-domain-state-after-navigation)、[SC-GEN-20](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-20-recovery-drill-remains-correlated-and-secret-free)、[SC-PRV-11](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-11-expiring-provider-output-is-not-permanent-delivery)。

- [ ] **5.9 收集确定性集成失败与受控恢复证据**
  - 目标文件或模块：`tests/contracts/providers/**`、`tests/integration/provider-recovery.test.ts`、`internal/evidence/M4/failure-cases/**`。
  - 前置依赖：5.4、5.5、5.6、5.7、5.8。
  - 完成条件：覆盖提交响应丢失、假完成、伪造及乱序回调、存储失败、旧租约、期限竞争与迟到成功；不宜真实触发的场景用样例，仅在安全且有授权时采集账户级失败证据；保持积分成本分离。
  - 验收证据：T09、T11、T12、T13、T14、T15、T19、T20、T22、T49、T53；[SC-GEN-08](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time)、[SC-GEN-10](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner)、[SC-GEN-12](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-12-stale-worker-cannot-acknowledge-new-lease)、[SC-GEN-13](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-13-late-success-after-refund-is-quarantined)、[SC-PRV-07](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-07-reject-forged-stale-or-wrong-account-observations)、[SC-PRV-08](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-08-authenticated-callback-is-durable-and-replay-safe)、[SC-PRV-09](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-09-runner-retry-does-not-duplicate-provider-spend)、[SC-PRV-10](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-10-missing-id-similarity-is-not-ownership-evidence)、[SC-PRV-11](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-11-expiring-provider-output-is-not-permanent-delivery)。

- [ ] **5.10 完成 M4 四行真实服务商与持久输出验收门槛**
  - 目标文件或模块：`internal/evidence/M4/provider-matrix.md`、`internal/evidence/M4/**`、`tests/e2e/provider-generation.spec.ts`。
  - 前置依赖：5.1、5.2、5.3、5.4、5.5、5.6、5.7、5.8、5.9。
  - 完成条件：在明确提供的账户及预算内，取得两家服务商各自文生与图生成功记录、准确契约及请求 ID、持久下载、媒体与积分成本结果、负面场景证据。所有 PRV 及生产 GEN 场景通过才关闭 G03/G10；资源不可用明确阻塞，Mock 不可替代。
  - 验收证据：T13、T14、T15、T20、T49、T53；[SC-PRV-01](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-01-all-four-rows-produce-owned-video)、[SC-PRV-02](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-02-contract-drift-is-explicit)、[SC-PRV-12](../changes/restart-shpitto-video-saas/specs/provider-integrations/spec.md#scenario-sc-prv-12-unavailable-paid-evidence-keeps-gate-open)、[SC-GEN-06](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-06-owned-asset-is-the-success-boundary)、[SC-GEN-08](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-08-untraceable-outcome-releases-credits-on-time)、[SC-GEN-10](../changes/restart-shpitto-video-saas/specs/generation-lifecycle/spec.md#scenario-sc-gen-10-deadline-and-success-share-one-winner)。

## 阶段门槛与未完成事项

| 门槛任务 | 范围 | 不得混淆的证据边界 |
| --- | --- | --- |
| 3.12 | M2 身份与积分不变量 | 不代表服务商、Stripe 或完整运营界面已经实现。 |
| 4.12 | M3 可持久化的无云端本地完整流程 | Mock 只证明本地业务行为，不能替代真实上游或支付证据。 |
| 5.10 | M4 两家服务商 × 两种模式与持久输出 | 必须具备授权账户、预算及四行实际结果；缺失任何一行均不通过。 |

新增细分用例仅强化既有验收，不增加商业范围：T05.a 为个人/团队及最后所有者边界，T59.a 为停用/暂停/冻结矩阵，T12.a 为独立期限扫描，T12.b 为旧租约代次防护。实现方须记录版本、环境、输入条件、预期、实际结果和脱敏证据路径。超过数字覆盖率不能豁免强制金额、权限和状态竞争场景。
