# Shpitto 重启 — 交付能力 OpenSpec 完整中文审核稿

阶段评审统一遵循[完整验收制度](stage-acceptance.zh-CN.md)：必过条件、证据环境、独立复核与候选摘要失效规则适用于本分册全部任务，文档审核不构成功能通过。

日期：2026-09-27。状态：需求、场景和实施任务说明；尚未实施、安装、运行应用测试、付款或发布。本文逐项对应英文规范，并保留全部 REQ、SC、D、J、T、G 及任务标识。工程规范以同一变更内英文 spec.md 为执行来源；中文用于详细审核。

覆盖四个能力：governed-skills、developer-documentation、deployment-release、template-commerce；共 21 条需求、44 个场景，以及 M7/M8 共 30 个未完成任务。下文的目标路径不表示实现文件已经存在。阶段门槛已固定为 M3=4.12、M4=5.10、M5=6.10、M6=7.14。M6 只完成后台及本地集成；最终导出部署模式的 SC-OPS-13 在 M8 的 9.14 和 9.15 闭环。

## governed-skills — 受规范约束的外部编程代理 Skills

### 目的

交付十二个可由外部编程代理发现和调用的 Skill，用于定制和扩展买家自己的 AI 视频 SaaS；同时保持业务契约、独立可信的验证机制以及可恢复的用户修改。

### REQ-SKL-01 完整的外部编程代理 Skill 目录

客户交付包必须包含上述十二个 Skill 的规范文件 skills/<name>/SKILL.md：quick-start、add-provider、add-generation-task、configure-credits、extend-assets、deploy-template、security-review、upgrade-template、customize-brand、create-page、modify-page、customize-site。每个 Skill 必须声明受支持输入、允许修改的路径和契约、输出、必需证据及恢复方式。轻量发现适配层必须支持 Codex、Claude Code 和 OpenCode，并说明真实能力差异；部署后的应用必须独立于编程代理 CLI 运行，也不得内置终端用户代理。

追踪：D09、D18、D28、D29、J1、J2、J9、T01、T42、T43、T50、G09、G18、G28、G29。对应任务：8.1、8.2、8.3、8.15。

#### SC-SKL-01 检查全部交付 Skill

- **当（WHEN）**：买家检查干净交付包中的 Skill 目录时。
- **则（THEN）**：十二个指定 Skill 均存在，并包含输入、范围、输出、证据和恢复约定；quick-start 覆盖持久化无云演示，deploy-template 覆盖受支持部署，security-review 按责任边界报告问题，upgrade-template 覆盖备份、兼容性和本地修改。

#### SC-SKL-02 发现 Skill 且不耦合应用运行时

- **当（WHEN）**：买家按照各受支持代理的发现说明操作，并在不运行代理进程的情况下启动导出的应用时。
- **则（THEN）**：适配层能够找到规范 Skill；不支持的代理行为明确披露；应用无需依赖 Codex、Claude Code 或 OpenCode 即可启动。

#### SC-SKL-03 通过专用 Skill 扩展业务能力

- **当（WHEN）**：add-provider、add-generation-task、configure-credits 或 extend-assets 提出明确范围的扩展时。
- **则（THEN）**：对应 Skill 记录供应商能力及安全提交和对账、任务状态及 DTO/积分/资产影响、版本化计价和有效期兼容性，或资产归属/接收/保留规则；涉及核心的修改进入明确的工程范围，并提供回归证据。

### REQ-SKL-02 四类有明确边界的个性化流程

四类个性化 Skill 必须通过已声明的品牌、内容、主题、路由和组件扩展面，修改买家自己的 AI SaaS 营销及产品界面。必须保留真实的认证、工作空间、支付、生成和下载行为，以及已有国际化边界；独立通用网站生成和浏览器可视化编辑器不属于本能力。

追踪：D06、D28、D29、J2、T32、T33、T34、T35、G06、G28、G29。对应任务：8.4、8.5、8.9、8.15。

#### SC-SKL-04 一致地定制品牌

- **当（WHEN）**：customize-brand 修改名称、颜色、标志或字体时。
- **则（THEN）**：声明的设计变量、资产和文案在共享页面框架中保持一致，并提供响应式及可访问性证据，保留业务操作。

#### SC-SKL-05 创建受支持页面

- **当（WHEN）**：create-page 新增用例或产品展示页面时。
- **则（THEN）**：新页面遵循允许的路由、导航、元数据和既有组件约定，且不改变认证或支付契约。

#### SC-SKL-06 修改保留真实功能的价格页面

- **当（WHEN）**：modify-page 修改价格页面区块时。
- **则（THEN）**：展示修改仍使用批准的产品目录和价格绑定及真实结账操作，不得替换为硬编码价格或模拟支付成功。

#### SC-SKL-07 定制整个受支持站点

- **当（WHEN）**：customize-site 修改共享主题和页面结构时。
- **则（THEN）**：营销及产品页面框架保持一致并支持响应式，同时登录、工作空间导航、生成、下载和支付流程保持可用。

### REQ-SKL-03 分类修改范围并保持语义契约

每个会修改文件的 Skill 必须先检查发布基线、已有未提交修改、目标和受保护契约，并记录范围清单。认证、成员关系、支付和 Webhook、积分、生成状态、数据库及验证/导出政策必须归类为专门工程修改。验证必须检查语义行为、导入和数据库边界，不能只检查文件路径；导入资源必须适配真实集成。

追踪：D28、D29、J2、T36、T37、T38、T43、G28、G29。对应任务：8.6、8.9、8.15。

#### SC-SKL-08 重新分类受保护修改

- **当（WHEN）**：视觉请求或实际差异修改受保护业务契约时。
- **则（THEN）**：普通定制不得宣称完成；修改必须进入明确范围的工程或扩展流程，并记录影响和验证要求。

#### SC-SKL-09 拒绝不安全的导入行为

- **当（WHEN）**：导入区块包含模拟支付回调、替代认证或未批准依赖时。
- **则（THEN）**：流程必须将其适配到批准的契约，或报告超范围依赖和修改，不得悄悄替换真实行为。

#### SC-SKL-10 发现受保护路径之外的行为破坏

- **当（WHEN）**：仅修改展示文件的差异破坏必需的结账、授权或生成流程时。
- **则（THEN）**：即使路径允许清单通过，语义验证仍必须失败，并阻止宣称完成或导出。

### REQ-SKL-04 验证信任独立于候选修改

受支持验证器必须从候选差异之外的固定可信发布或工作树执行。证据必须将暂存源码、锁文件、契约及相关配置的精确摘要，与验证器/政策版本及必需检查结果绑定。导出和部署必须拒绝缺失、失败或过期证据；候选修改不得通过修改检查自我认证。合法政策修改必须基于旧可信基线进行独立审核并明确重建基线；不得宣称买家拥有的源码不可修改。

追踪：D16、D29、J2、J9、T39、T40、T54、T55、G16、G29。对应任务：8.7、8.8、8.9、8.15。

#### SC-SKL-11 拒绝候选验证器绕过

- **当（WHEN）**：候选修改削弱验证规则、替换预期结果或跳过必需检查时。
- **则（THEN）**：外部可信验证器必须拒绝该修改或将其重新归类为政策修改，不得接受候选版本自行产生的通过结果。

#### SC-SKL-12 拒绝过期或缺失证据

- **当（WHEN）**：源码、锁文件、契约或相关配置在验证通过后发生变化，或证据缺失/失败时。
- **则（THEN）**：提供的导出器和部署器必须拒绝该候选版本，直到必需检查生成与精确暂存摘要匹配的证据。

#### SC-SKL-13 审核有意的政策修订

- **当（WHEN）**：工程修改确实需要新验证政策时。
- **则（THEN）**：必须先基于旧可信基线独立审核并记录原因、范围和证据，再明确重建基线；普通视觉 Skill 不得自行完成该批准。

### REQ-SKL-05 恢复过程中保留用户修改

会修改文件的 Skill 必须报告修改文件、检查结果、剩余风险及限定范围的恢复补丁。流程必须保留无关的已有修改，并在破坏性回滚前解决重叠修改归属，不得以全仓库重置作为普通定制恢复方式。

追踪：D29、J2、J9、T41、T50、G29。对应任务：8.10、8.15。

#### SC-SKL-14 只回滚可归属的修改

- **当（WHEN）**：失败的定制与无关的已有未提交文件同时存在时。
- **则（THEN）**：恢复操作仅撤销可归属于本次定制的修改，并逐字节保留无关文件。

#### SC-SKL-15 处理重叠的未提交修改

- **当（WHEN）**：回滚会覆盖重叠的已有修改时。
- **则（THEN）**：流程必须识别重叠，并在破坏性操作前形成具体的合并或恢复方案，不得直接重置整个文件或仓库。

### REQ-SKL-06 有来源记录地复用许可资源

Skill 包必须复用已选定的 shadcn 指南和组件，并记录固定源码修订或内容摘要、适配记录及再分发声明。其他开源资源必须确认文件级来源和许可适配性。允许借鉴旧项目概念，但旧运行时契约和历史不得进入客户应用运行时或交付包。

追踪：D09、D14、D16、D31、J2、J9、T36、T46、T52、T62、G09、G14、G16、G31。对应任务：8.11、9.2、8.15。

#### SC-SKL-16 交付来源可追踪的复用组件

- **当（WHEN）**：交付包包含批准的上游指南或区块时。
- **则（THEN）**：必须记录来源修订或摘要、许可声明和项目适配；仅固定 shadcn CLI 版本不足以固定其抓取的资源。

#### SC-SKL-17 排除未经确认或旧运行时资源

- **当（WHEN）**：资源的再分发权限不明或引入旧代理/运行时依赖时。
- **则（THEN）**：在来源和适配问题解决前必须排除该资源，且导出应用保持独立于旧网站生成运行时。

## developer-documentation — 版本化开发者文档

### 目的

为评估和运行源码模板的开发者提供可发现且与发布版本一致的文档，包括完整 Skill 指南、真实 API 契约，以及与离线买家交付内容共享的维护来源。

### REQ-DOC-01 公开且版本化的 Fumadocs 导航

独立销售网站必须使用 Fumadocs Core/UI 16.15.14 和 MDX 15.4.5 提供公开 /docs，包括 Template、Skills、APIs、Releases 导航、搜索、直达链接、版本选择和逐页版本标签。产品文档默认英文，并保持一致的本地化边界；搜索仅索引已发布版本内容。

追踪：D04、D06、D30、J10、T56、T58、G04、G06、G30。对应任务：8.12、8.14、9.12、8.15。

#### SC-DOC-01 发现模板、Skill 和 API 内容

- **当（WHEN）**：访客打开销售站 Docs 或直接访问某页链接时。
- **则（THEN）**：模板、Skill 和 API 内容能够通过导航或搜索找到，直达链接有效，且显示当前发布版本标签。

#### SC-DOC-02 切换文档版本

- **当（WHEN）**：读者切换至另一个已发布版本或搜索其页面时。
- **则（THEN）**：导航和示例对应所选版本；公开搜索不包含未发布或私有内容，页面语言保持一致。

### REQ-DOC-02 记录真实接口并保持公共 API 延后边界

模板文档必须说明能力、V1 排除项、目录和模块归属、前置条件、本地演示、配置、工作空间/积分/任务、部署、升级和故障排查。API 参考必须从发布的 DTO、路由和适配器契约生成，或与它们校核，准确标识基于会话的内部接口和扩展点。必须明确公共生成 API 与客户 API Key 延后，不得虚构认证方式、可用端点或不可用的设置页。

追踪：D08、D15、D18、D30、J1、J9、J10、T01、T57、T58、G08、G15、G18、G30。对应任务：8.13、8.14、8.15。

#### SC-DOC-03 遵循版本一致的设置和运营指南

- **当（WHEN）**：买家遵循已交付版本的设置、配置、本地演示、部署或升级示例时。
- **则（THEN）**：路径、命令、环境变量名称和受支持行为均与该版本一致，并明确所需前置条件和限制。

#### SC-DOC-04 按照契约检查 API 示例

- **当（WHEN）**：开发者将 API 文档与发布的路由、DTO、授权及集成适配器比较时。
- **则（THEN）**：示例必须匹配真实契约，并准确标明内部会话接口和 Webhook/服务边界；不得把公共生成 API 或客户 API Key 管理展示为已可用。

### REQ-DOC-03 说明每个交付 Skill

文档必须为 REQ-SKL-01 的全部十二个 Skill 提供匹配发布版本的参考和可用调用示例，说明参数、输入输出、受支持代理、允许范围、保护边界、必需检查、回滚和转入工程修改的条件。示例不得鼓励绕过受支持的验证流程。

追踪：D09、D28、D29、D30、J2、J10、T42、T57、G09、G28、G29、G30。对应任务：8.13、8.14、8.15。

#### SC-DOC-05 审核十二个 Skill 参考页

- **当（WHEN）**：将发布目录与 Docs 中的 Skill 页面和示例比较时。
- **则（THEN）**：十二个 Skill 均具有匹配的调用、输入输出、范围和恢复指南，不得遗漏 Skill 或宣称不支持的成功行为。

### REQ-DOC-04 与买家指南共享一个内容来源

规范内容必须位于 content/docs/<release>/，包含 release、title、description、section、status 及相关契约标识。销售站 Docs 与 docs/buyer/ 中的便携 Markdown 和代码片段指南必须从同一个维护来源生成。客户包必须包含买家必需指南和匹配版本元数据，并排除销售站外壳、结账、分析及私有记录。

追踪：D16、D30、J1、J9、J10、T46、T47、T58、G16、G30。对应任务：8.14、9.1、9.3、8.15、9.12、9.14。

#### SC-DOC-06 导出同步的买家指南

- **当（WHEN）**：为销售站和客户包构建某个已标记内容版本时。
- **则（THEN）**：两个输出标识同一模板和内容版本及契约引用；设置和使用指南无需仅依赖远程销售站即可阅读。

#### SC-DOC-07 文档导出不包含销售站实现

- **当（WHEN）**：在干净源码导出中检查买家指南产物时。
- **则（THEN）**：必须包含必要指南和示例，但不得包含销售站应用代码、分析、购买记录、凭据和私有工程内容。

### REQ-DOC-05 将 MDX 视为可信源码并清理示例

文档流水线只能编译可信仓库中的 MDX。终端用户内容不得作为 MDX 执行。公开及打包示例必须使用占位符和经过清理的固定数据，不得包含凭据、签名 URL 或客户私有数据；公开内容状态必须在构建和索引阶段执行。

追踪：D16、D30、J10、T46、T57、T58、G16、G30。对应任务：8.12、8.13、8.14、8.15。

#### SC-DOC-08 拒绝不安全文档输入

- **当（WHEN）**：不可信 MDX、未发布页面或含敏感数据的示例进入文档流水线时。
- **则（THEN）**：不可信内容不得被编译或执行，未发布内容不得进入公开索引，含敏感数据的示例必须导致发布检查失败。

## deployment-release — 独立部署与受控发布

### 目的

使买家拥有的源码交付在本地、托管和 Docker 应用部署模式中可复现，并明确导出边界、经验证产物、协调迁移和可恢复运营。

### REQ-REL-01 明确的导出及依赖边界

发布导出必须使用正向允许清单，包含新根应用源码、迁移、运行和部署配置、Skills、买家指南、本地固定数据、许可声明及版本元数据。必须排除 legacy/、vendor/、internal/、.omx/、原 .git/、代理个人状态、秘密、缓存和构建产物；构建、检查及镜像上下文必须排除冻结的旧应用。锁文件和包引用不得依赖缺失的私有依赖或开发者本地路径。

追踪：D01、D14、D16、D31、J1、J9、T45、T46、T47、T52、T62、G01、G14、G16、G31。对应任务：9.1、9.2、9.3、9.14、9.15。

#### SC-REL-01 只导出允许的源码

- **当（WHEN）**：生成发布包和应用镜像上下文时。
- **则（THEN）**：清单检查必须说明全部包含文件，并证明旧项目、销售站、内部资料、历史、秘密、状态和缓存路径均被排除；不得以整仓复制加排除清单代替。

#### SC-REL-02 独立解析依赖

- **当（WHEN）**：检查导出的锁文件、包元数据及许可清单时。
- **则（THEN）**：运行、构建和检查依赖不得指向归档代码、开发者工作区或不可用私有包；必须包含源码再分发声明，并排除未经许可的企业版包。

### REQ-REL-02 可复现产物与干净历史

发布必须包含 template-version.json、受支持迁移范围、精确依赖和锁文件标识、模型/方案契约版本、许可清单及匹配的文档版本。客户仓库必须从干净导出初始化新历史，校验和 ZIP 内容必须与已审核源码版本一致；REQ-SKL-04 的证据必须绑定精确导出或部署的候选版本。全部交付部署方案、配置和买家指南必须在候选冻结前定稿。此后任一交付字节变化都必须使旧摘要和证据失效，重新生成包和干净仓库，并在发布前重跑干净安装及受影响的部署和契约检查。

追踪：D01、D16、D29、D30、J1、J9、T46、T47、T55、T58、G01、G16、G29、G30。对应任务：9.3、9.4、9.11、9.14、9.15。

#### SC-REL-03 检查全新的客户产物

- **当（WHEN）**：在开发工作区之外打开发布 ZIP 和新初始化客户仓库时。
- **则（THEN）**：源码版本、校验和及文档和迁移清单必须一致，不得保留原开发历史，安装不得依赖开发者忽略文件。

#### SC-REL-04 阻止发布验证后的变更

- **当（WHEN）**：暂存导出或部署内容与可信通过摘要不同时。
- **则（THEN）**：提供的发布和部署入口必须拒绝该内容，并要求匹配的新证据，不能只依赖提交标签；修订候选必须生成新的归档和仓库摘要，重跑干净安装，并重新收集受影响部署和契约证据。

### REQ-REL-03 两条具体生产部署路径

发布必须记录并验证托管参考路径：Vercel Web、Neon PostgreSQL 17、私有 Cloudflare R2、Trigger.dev Cloud 和 Resend。还必须支持多阶段 Next standalone Docker 应用镜像，使用相同外部数据库、存储、Trigger 和邮件契约，并包含所需 public 与 .next/static 输出。买家必须提供自己的账号和秘密；Docker 支持不表示完整生产基础设施自托管。

追踪：D01、D07、D15、J9、T47、T48、T62、G01、G07、G15、G31。对应任务：9.5、9.6、9.7、9.14、9.15。

#### SC-REL-05 部署托管参考路径

- **当（WHEN）**：买家使用干净版本和自己的账号遵循托管指南时。
- **则（THEN）**：Web、数据库迁移、Trigger 计划和工作器、私有存储、邮件及已配置回调必须工作，前置条件和版本有记录；生成不得要求 HTTP 请求一直等待视频完成。

#### SC-REL-06 运行 Docker 应用

- **当（WHEN）**：买家构建并运行文档中的 standalone 应用镜像时。
- **则（THEN）**：公开和静态资产及服务端路由必须与声明的外部服务协作正常；指南明确区分应用容器部署和完整基础设施自托管。

### REQ-REL-04 持久化无云模式与安全生产配置

本地模式必须使用 Node、pnpm、Docker、持久化 PostgreSQL、数据库轮询工作器、Mock 供应商、私有本地资产卷和 SMTP 邮件收件环境，无需云密钥。生产配置必须拒绝 Mock、本地任务或存储驱动、演示积分、localhost 地址、弱或默认秘密及必需服务缺失，但允许关闭联盟功能。秘密仅能位于服务端或工作器，诊断只能显示配置存在性和状态，不能显示值。

追踪：D01、D18、D24、J1、J9、T01、T29、T47、T48、T62、G01、G18、G24、G31。对应任务：9.4、9.7、9.14、9.15。

#### SC-REL-07 无云密钥启动并重启

- **当（WHEN）**：干净客户工作区启动文档中的本地模式并重启 Web 和工作器时。
- **则（THEN）**：注册、工作空间、Mock 成功/失败/取消、保存的资产及积分历史无需卖家或云账号即可工作并持久化；媒体探测工具由工作器容器提供。

#### SC-REL-08 拒绝不安全的生产模式

- **当（WHEN）**：生产启动时使用演示驱动、默认秘密、缺失必需服务，或关闭联盟功能时。
- **则（THEN）**：不安全的必需配置必须阻止启动并提供脱敏诊断；核心配置正确时可以在关闭可选联盟功能的情况下启动。

### REQ-REL-05 协调迁移与运营恢复

部署必须通过 PostgreSQL 直连和迁移锁执行唯一且已审核的 Drizzle 迁移序列，并记录同一发布中 Web 与工作器的兼容性。先执行扩展、回填、切换和收缩，再实施破坏性修改。回滚必须选择兼容版本，不得盲目降级数据库或重复付费提交。运行手册必须覆盖备份恢复、任务和集成恢复、依赖健康、脱敏关联日志、告警及保留策略；RPO 15 分钟、RTO 4 小时是需由所选服务档位和恢复证据证明的目标，不是可用性承诺。

追踪：D07、D15、D17、D20、J4、J9、T12、T48、T49、T50、T53、T60、G07、G15、G17、G20。对应任务：9.7、9.8、9.9、9.14、9.15。

#### SC-REL-09 应用兼容的发布迁移

- **当（WHEN）**：Web 和工作器从受支持旧版本升级时。
- **则（THEN）**：唯一加锁迁移必须在不兼容代码之前应用，版本和数据库结构检查通过，并记录用户定制文件；不得引入独立后台迁移系统。

#### SC-REL-10 有意识地恢复与回滚

- **当（WHEN）**：部署失败需要回滚或提出破坏性迁移时。
- **则（THEN）**：运营人员必须使用已记录兼容性和经过验证的备份恢复步骤，必要时排空或对账活动尝试，避免盲目降级结构或重复付费提交；恢复证据明确目标是否达到。

#### SC-REL-11 使用可关联运营证据恢复

- **当（WHEN）**：超时任务、资产复制失败、死信 Webhook 或积分账本不一致触发告警时。
- **则（THEN）**：运行手册通过工作空间、任务、尝试、命令和发布标识连接安全领域命令及脱敏日志；存活和就绪检查区分进程、数据库结构和外部服务降级，不泄露秘密。

### REQ-REL-06 基于证据的 Beta 与稳定发布门槛

必须按[完整阶段制度](stage-acceptance.zh-CN.md)分别记录 M8-RC、M8-BETA、M8-STABLE。Beta 要求全部适用承诺范围证据及批准的商业输入；稳定版还要求有代表性的用户流程、恢复／升级、监控观察、Beta 问题处置与当前候选证据。9.15 和 M8 总状态只能在 STABLE 通过后完成，Beta 通过后继续保持未完成；不预设固定观察天数或客户人数。

发布状态必须依据 G01–G31 和必需 T01–T62 证据，并覆盖全部承诺的商业 V1 能力。证据必须标识精确版本、环境、用例、结果和脱敏产物，并区分本地/Mock、真实服务支持、支付测试模式及生产结果。缺失、阻塞或跳过的证据不得标为通过；固定日期不得覆盖范围或未解决的发布阻塞问题，真实支出和发布需要各自已授权的执行步骤。

追踪：D03、D19、D30、D31、J1、J2、J3、J4、J5、J6、J7、J8、J9、J10、T01、T21、T25、T30、T47、T48、T53、T55、T58、T62、G03、G19、G30、G31。对应任务：9.13、9.14、9.15。

#### SC-REL-12 拒绝不完整的商业发布证据

- **当（WHEN）**：发布矩阵缺少某个真实供应商或模式、联盟/后台/Docs 能力未完成，或跳过必需检查时。
- **则（THEN）**：矩阵必须记录限制，商业 V1 门槛保持未完成，不得将 Mock 或包已存在视为证明。

#### SC-REL-13 准确标注就绪状态

- **当（WHEN）**：审核者评估付费 Beta 或稳定候选版本时。
- **则（THEN）**：RC、BETA、STABLE 分别标识候选及必需证据；仅 BETA 通过仍保持 9.15 未完成；稳定版必须有代表性观察、阻塞问题关闭及迁移／支持指南；仅审核本计划既不开始发布，也不表示实现已通过。

## template-commerce — 独立的源码模板销售与交付

### 目的

运营轻量的源码许可销售和交付，使买家 SaaS 的支付、联盟和运行时不耦合卖家账号，同时保留已取得版本和更新权益。

### REQ-COM-01 分离卖家交易与买家 SaaS 账号

卖家必须使用独立 vendor/sales 应用，通过 Lemon Squeezy 托管结账销售源码许可，并使用其商户联盟功能。买家 SaaS 的支付必须使用买家自己的 Stripe 账号和可选 FirstPromoter 项目。账号、凭据、订单、归因、佣金规则和结算必须分离；卖家许可订单不得发放视频服务积分，也不得自动继承 SaaS 的工作空间首次付款规则。客户构建、运行和导出不得依赖卖家销售代码或账号，V1 不增加自建商城平台。

追踪：D01、D04、D11、D23、D24、J1、J5、J8、T21、T29、T46、T47、G01、G04、G11、G23、G24。对应任务：9.10、9.12、9.15。

#### SC-COM-01 许可销售不进入 SaaS 权益

- **当（WHEN）**：记录卖家源码许可订单或买家 SaaS 订阅付款时。
- **则（THEN）**：事件只能影响其所属业务记录和账号；许可付款不得创建工作空间视频积分，也不得消耗 SaaS 联盟资格。

#### SC-COM-02 保持独立联盟项目

- **当（WHEN）**：配置卖家联盟及买家可选 FirstPromoter 项目时。
- **则（THEN）**：凭据、推荐、订单、规则和付款必须隔离；客户应用及核心本地演示无需卖家账号或开启买家联盟即可运行。

### REQ-COM-02 手动且干净的 Beta 交付

Beta 交付必须核验已付款源码订单，并在卖家专属记录中保存买家 GitHub 身份、取得版本、购买日期和更新权益截止时间。必须从干净导出建立每位客户独立的私有仓库，并提供带校验和的版本化 ZIP。仓库历史和包不得包含旧项目、内部及卖家记录或原开发历史。允许手动配置访问权限，无需自动商城。

追踪：D01、D04、D16、J1、J9、T46、T47、G01、G04、G16。对应任务：9.3、9.11、9.15。

#### SC-COM-03 交付一个已付款源码订单

- **当（WHEN）**：运营人员为已核验买家执行文档中的手动交付流程时。
- **则（THEN）**：买家获得其独立干净私有仓库及匹配校验和 ZIP，版本和权益被私下记录，不泄露其他客户记录或原仓库历史。

### REQ-COM-03 十二个月更新且运行权限不失效

源码购买必须包含十二个月更新和基础技术支持。权益到期后，已取得版本及其文件访问必须继续可用；运行时不得依赖卖家许可服务器，也不得禁用已取得版本。仅在权益有效期间向客户私有仓库交付后续版本；续费使客户取得后续版本资格，不改变已有版本归属。定制开发和部署协助必须作为单独收费服务。

追踪：D16、D17、J1、J9、T50、T51、G16、G17。对应任务：9.11、9.13、9.15。

#### SC-COM-04 到期后保留已取得源码

- **当（WHEN）**：买家十二个月更新和支持权益到期时。
- **则（THEN）**：其已取得文件仍可访问，已部署版本继续运行；停止交付后续版本，但不撤销旧源码，也不得通过共享仓库暴露全部未来历史。

#### SC-COM-05 续费后续版本访问

- **当（WHEN）**：已到期买家续费，或请求独立范围的定制和部署协助时。
- **则（THEN）**：续费记录后续版本资格和迁移指南，不改变已取得版本；额外服务与已包含的基础支持明确区分。

### REQ-COM-04 明确的商业发布前置条件

卖家发布检查表必须在公开接单前记录商户批准、源码售价、许可项目和席位限制、支持范围、源码联盟经济条款及受支持的付款开户要求。尚未决定的商业值必须明确标为待定，不得虚构或表述成已批准需求。计划及沙箱演练不得在没有已授权执行步骤时触发真实扣款、资金转移、邀请或公开发布。

追踪：D04、D17、D19、D23、J1、J8、J9、T30、T51、G04、G17、G19、G23。对应任务：9.10、9.13、9.15。

#### SC-COM-06 依据真实前置条件开放交易

- **当（WHEN）**：评估销售站是否可以公开接受源码许可订单时。
- **则（THEN）**：必须记录商户和账号前置条件及批准的商业条款；未知值阻止该商业行为但不重新开放已定技术选型，计划审核状态不能作为资金或发布授权。

## 8. M7 — 受规范约束的定制与开发者文档

所有复选框均保持未完成；列出的证据是未来验收要求，不表示已经执行或通过。早期 Skill 和 Docs 基础工作依赖 M1 门槛 2.8；契约扩展 Skill 定稿还依赖 M3 门槛 4.12，最终集成行为证据依赖 5.10、6.10 和 7.14。

- [ ] 8.1 建立十二个 Skill 的目录以及 Codex、Claude Code、OpenCode 轻量发现适配层；声明各适配层受支持行为，确保部署应用不依赖代理 CLI。
  - 目标路径（Paths）：`skills/*/SKILL.md`、`.shpitto/contracts/skills.json`、`docs/buyer/agents.md`。
  - 前置依赖（Depends）：2.8。
  - 验收证据（Evidence）：SC-SKL-01、SC-SKL-02、T42；记录精确发布版本、环境和脱敏结果。

- [ ] 8.2 编写 quick-start、deploy-template、security-review、upgrade-template，明确前置条件、输出和证据以及恢复契约。
  - 目标路径（Paths）：`skills/{quick-start,deploy-template,security-review,upgrade-template}/SKILL.md`。
  - 前置依赖（Depends）：8.1。
  - 验收证据（Evidence）：SC-SKL-01、T01、T42、T50；记录精确发布版本、环境和脱敏结果。

- [ ] 8.3 仅在 M3 适配器和领域契约门槛通过后定稿 add-provider、add-generation-task、configure-credits、extend-assets，并说明合法核心修改分类；此前草稿不作为最终证据。
  - 目标路径（Paths）：`skills/{add-provider,add-generation-task,configure-credits,extend-assets}/SKILL.md`、`.shpitto/contracts/extensions.json`。
  - 前置依赖（Depends）：8.1、4.12。
  - 验收证据（Evidence）：SC-SKL-03、SC-SKL-08、T42、T43；记录精确发布版本、环境和脱敏结果。

- [ ] 8.4 在声明的变量、资产、导航和路由契约上实现 customize-brand 与 create-page 指南及模板，记录响应式和可访问性预期。
  - 目标路径（Paths）：`skills/{customize-brand,create-page}/SKILL.md`、`src/config/{brand,navigation}.ts`、`.shpitto/contracts/presentation.json`。
  - 前置依赖（Depends）：8.1。
  - 验收证据（Evidence）：SC-SKL-04、SC-SKL-05、T32、T33；记录精确发布版本、环境和脱敏结果。

- [ ] 8.5 实现 modify-page 与 customize-site 指南，保留真实价格绑定、结账、共享页面框架和产品流程，将修改限制在买家 SaaS 展示范围。
  - 目标路径（Paths）：`skills/{modify-page,customize-site}/SKILL.md`、`.shpitto/contracts/presentation.json`。
  - 前置依赖（Depends）：8.4。
  - 验收证据（Evidence）：SC-SKL-06、SC-SKL-07、T34、T35；记录精确发布版本、环境和脱敏结果。

- [ ] 8.6 实现基线及已有修改清单，以及受保护范围和导入分类，覆盖不安全导入区块和明确转入工程修改的流程。
  - 目标路径（Paths）：`scripts/validate-change.ts`、`.shpitto/contracts/protected-paths.json`、`.shpitto/contracts/change-manifest.json`。
  - 前置依赖（Depends）：8.3、8.5。
  - 验收证据（Evidence）：SC-SKL-08、SC-SKL-09、T36、T37、T43；记录精确发布版本、环境和脱敏结果。

- [ ] 8.7 从候选修改之外的固定可信发布或工作树加载验证器，并对政策修订要求独立审核。
  - 目标路径（Paths）：`scripts/validate-change.ts`、`.shpitto/contracts/validation-policy.json`、`docs/buyer/customization.md`。
  - 前置依赖（Depends）：8.6。
  - 验收证据（Evidence）：SC-SKL-11、SC-SKL-13、T39、T54；记录精确发布版本、环境和脱敏结果。

- [ ] 8.8 将必需检查结果绑定精确暂存源码、锁文件、契约和配置摘要，并为导出及部署入口实现共享证据检查。
  - 目标路径（Paths）：`scripts/validate-change.ts`、`scripts/export-release.ts`、`scripts/deploy-release.ts`、`.shpitto/contracts/validation-evidence.json`。
  - 前置依赖（Depends）：8.7。
  - 验收证据（Evidence）：SC-SKL-12、SC-REL-04、T40、T55；记录精确发布版本、环境和脱敏结果。

- [ ] 8.9 针对已集成认证、积分、生成、支付和后台行为，验证四类代表性定制流程及语义破坏和绕过反例。
  - 目标路径（Paths）：`tests/customization/`、`internal/evidence/m7/customization/`。
  - 前置依赖（Depends）：8.5、8.6、8.7、8.8、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-SKL-04、SC-SKL-05、SC-SKL-06、SC-SKL-07、SC-SKL-09、SC-SKL-10、SC-SKL-11、SC-SKL-12、T32、T33、T34、T35、T36、T38、T39、T40、T54、T55；记录精确发布版本、环境和脱敏结果。

- [ ] 8.10 实现限定范围的回滚报告和补丁，验证无关已有修改保留及重叠修改解决，不使用全仓库重置。
  - 目标路径（Paths）：`scripts/rollback-customization.ts`、`tests/customization/rollback/`、`docs/buyer/customization.md`。
  - 前置依赖（Depends）：8.6。
  - 验收证据（Evidence）：SC-SKL-14、SC-SKL-15、T41、T50；记录精确发布版本、环境和脱敏结果。

- [ ] 8.11 记录复制的 shadcn 等资源修订或摘要、许可声明和适配；排除来源不明资源及旧运行时导入。
  - 目标路径（Paths）：`internal/licenses/resource-inventory.json`、`THIRD_PARTY_NOTICES`、`skills/`。
  - 前置依赖（Depends）：8.1、8.4、8.5。
  - 验收证据（Evidence）：SC-SKL-16、SC-SKL-17、T36、T46、T52；记录精确发布版本、环境和脱敏结果。

- [ ] 8.12 构建 Fumadocs 版本化导航、仅已发布内容搜索和直达链接外壳，使用可信仓库 MDX，并保持默认英文内容一致。
  - 目标路径（Paths）：`vendor/sales/app/docs/`、`content/docs/`、`vendor/sales/source.config.ts`。
  - 前置依赖（Depends）：2.8。
  - 验收证据（Evidence）：SC-DOC-01、SC-DOC-02、SC-DOC-08、T56、T58；记录精确发布版本、环境和脱敏结果。

- [ ] 8.13 根据发布契约编写模板教程、全部十二个 Skill 参考以及真实 API 和集成示例；标明公共 API 延后边界，并清理示例固定数据。
  - 目标路径（Paths）：`content/docs/<release>/{template,skills,apis,releases}/`、`scripts/check-doc-contracts.ts`。
  - 前置依赖（Depends）：8.1、8.2、8.3、8.4、8.5、8.12、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-DOC-03、SC-DOC-04、SC-DOC-05、SC-DOC-08、T01、T42、T57；记录精确发布版本、环境和脱敏结果。

- [ ] 8.14 从共享发布来源生成便携买家 Markdown 和代码片段，并验证版本链接、示例准确性以及销售站和私有内容排除。
  - 目标路径（Paths）：`scripts/export-buyer-docs.ts`、`docs/buyer/`、`tests/docs/`、`internal/evidence/m7/docs/`。
  - 前置依赖（Depends）：8.12、8.13。
  - 验收证据（Evidence）：SC-DOC-01、SC-DOC-02、SC-DOC-03、SC-DOC-04、SC-DOC-05、SC-DOC-06、SC-DOC-07、SC-DOC-08、T46、T47、T56、T57、T58；记录精确发布版本、环境和脱敏结果。

- [ ] 8.15 M7 门槛：审核全部十二个 Skill、四类定制、可信验证、回滚、来源和匹配版本的 Docs；关闭全部必需检查失败后才能接受本阶段。
  - 目标路径（Paths）：`internal/evidence/m7/gate.md`、`.shpitto/contracts/validation-evidence.json`。
  - 前置依赖（Depends）：8.1、8.2、8.3、8.4、8.5、8.6、8.7、8.8、8.9、8.10、8.11、8.12、8.13、8.14、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-SKL-01、SC-SKL-02、SC-SKL-03、SC-SKL-04、SC-SKL-05、SC-SKL-06、SC-SKL-07、SC-SKL-08、SC-SKL-09、SC-SKL-10、SC-SKL-11、SC-SKL-12、SC-SKL-13、SC-SKL-14、SC-SKL-15、SC-SKL-16、SC-SKL-17、SC-DOC-01、SC-DOC-02、SC-DOC-03、SC-DOC-04、SC-DOC-05、SC-DOC-06、SC-DOC-07、SC-DOC-08、T32、T33、T34、T35、T36、T37、T38、T39、T40、T41、T42、T43、T52、T54、T55、T56、T57、T58；记录精确发布版本、环境和脱敏结果。

## 9. M8 — 部署、商业交付与发布

执行顺序以依赖关系为准，而非数字大小：先在 9.5–9.9 编写和预检全部交付配置与手册，并在 9.12 重新生成买家指南；再由 9.3 冻结候选，在 9.4 验证同一候选的本地安装，在 9.14 验证托管、Docker 和 SC-OPS-13，最后在 9.15 接受。冻结后任一交付字节变化都会使证据失效，必须重新生成归档和仓库摘要、重跑干净安装及受影响的部署和契约证明。内部证据及卖家专属记录可在不改变客户交付内容的情况下更新。真实支出、客户邀请和正式发布遵循各自已授权执行步骤。

- [ ] 9.1 实现正向发布允许清单及隔离的镜像、构建和检查上下文，包含买家文档和 Skills，明确排除旧项目、销售站、内部资料、状态和历史。
  - 目标路径（Paths）：`scripts/export-release.ts`、`.shpitto/contracts/export-manifest.json`、`.dockerignore`。
  - 前置依赖（Depends）：8.8、8.14。
  - 验收证据（Evidence）：SC-REL-01、SC-DOC-07、T45、T46、T58；记录精确发布版本、环境和脱敏结果。

- [ ] 9.2 检查导出依赖、锁文件中的私有和本地引用、秘密及再分发权；生成完整组件及二进制声明，拒绝未经许可的企业版导入。
  - 目标路径（Paths）：`scripts/check-release-boundaries.ts`、`THIRD_PARTY_NOTICES`、`internal/licenses/`、`internal/evidence/m8/export-scan/`。
  - 前置依赖（Depends）：9.1、8.11。
  - 验收证据（Evidence）：SC-REL-02、SC-SKL-16、SC-SKL-17、T46、T52、T62；记录精确发布版本、环境和脱敏结果。

- [ ] 9.3 在其他交付源码、部署方案、配置和指南定稿后，先定稿版本、迁移、模型、方案和 Docs 清单及打包输入，再运行可信候选检查并冻结精确暂存摘要，最后从完全相同的内容生成候选校验和 ZIP 和可丢弃干净历史仓库；9.14 和 9.15 通过前不得标为可发布。
  - 目标路径（Paths）：`template-version.json`、`scripts/export-release.ts`、`scripts/package-release.ts`、`internal/evidence/m8/artifact-manifest/`。
  - 前置依赖（Depends）：9.1、9.2、8.15、9.5、9.6、9.7、9.8、9.9、9.12。
  - 验收证据（Evidence）：SC-REL-03、SC-REL-04、SC-DOC-06、T46、T47、T55、T58；记录精确发布版本、环境和脱敏结果。

- [ ] 9.4 在全新无云环境中验证 9.3 的不可变候选，包括重启、Mock 成功/失败/取消、积分、媒体探测和下载；只写入证据，如需改变交付文件则重新执行 9.3。
  - 目标路径（Paths）：`tests/release/local-export/`、`internal/evidence/m8/local-demo/`。
  - 前置依赖（Depends）：9.3。
  - 验收证据（Evidence）：SC-REL-03、SC-REL-07、T01、T47、T62；记录精确发布版本、环境和脱敏结果。

- [ ] 9.5 在候选冻结前编写并预检 Vercel、Neon、R2、Trigger、Resend 参考配置和规范部署指南，记录买家自有服务前置条件；最终导出版本的运行证明由 9.14 完成。
  - 目标路径（Paths）：`content/docs/<release>/template/deploy-managed.mdx`、`vercel.json`、`trigger.config.ts`、`internal/evidence/m8/managed-preflight/`。
  - 前置依赖（Depends）：9.1、8.15、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-REL-05、T47、T48、T62；记录精确发布版本、环境和脱敏结果。

- [ ] 9.6 在候选冻结前编写并预检多阶段 Next standalone Docker 镜像、公开及静态文件打包和仅应用部署的规范指南；最终导出镜像运行证明由 9.14 完成。
  - 目标路径（Paths）：`Dockerfile`、`docker/`、`content/docs/<release>/template/deploy-docker.mdx`、`internal/evidence/m8/docker-preflight/`。
  - 前置依赖（Depends）：9.1、8.15、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-REL-06、T48、T62；记录精确发布版本、环境和脱敏结果。

- [ ] 9.7 定稿生产模式保护、脱敏诊断、数据库直连迁移顺序和规范检查表，并在冻结前预检两条方案；最终不可变候选检查由 9.14 完成。
  - 目标路径（Paths）：`src/config/env.ts`、`scripts/migrate.ts`、`content/docs/<release>/template/deployment-checklist.mdx`、`tests/release/config-migration/`。
  - 前置依赖（Depends）：9.5、9.6。
  - 验收证据（Evidence）：SC-REL-08、SC-REL-09、T29、T48、T50、T60、T62；记录精确发布版本、环境和脱敏结果。

- [ ] 9.8 在候选冻结前定稿回滚、备份、恢复手册和维护命令并演练，记录观察到的恢复时间；9.14 再次确认最终候选兼容性和恢复证据。
  - 目标路径（Paths）：`content/docs/<release>/template/upgrade-recovery.mdx`、`scripts/maintenance/`、`internal/evidence/m8/restore-preflight/`。
  - 前置依赖（Depends）：9.7。
  - 验收证据（Evidence）：SC-REL-09、SC-REL-10、T12、T48、T50、T53；记录精确发布版本、环境和脱敏结果。

- [ ] 9.9 定稿健康检查、日志、告警实现和规范恢复手册，在冻结前预检工作器、存储及回调故障，并在 9.14 重跑受影响的最终候选运营用例。
  - 目标路径（Paths）：`content/docs/<release>/template/operations.mdx`、`src/app/api/health/`、`internal/evidence/m8/operations-preflight/`。
  - 前置依赖（Depends）：9.7、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-REL-11、T12、T49、T53；记录精确发布版本、环境和脱敏结果。

- [ ] 9.10 为隔离销售应用配置 Lemon Squeezy 托管源码结账及商户联盟，并记录其与 Stripe、FirstPromoter SaaS 的账号、订单和政策分离。
  - 目标路径（Paths）：`vendor/sales/`、`internal/vendor/commerce-setup.md`、`internal/evidence/m8/commerce-separation/`。
  - 前置依赖（Depends）：9.1、6.10、7.14。
  - 验收证据（Evidence）：SC-COM-01、SC-COM-02、SC-COM-06、T21、T29、T46、T30；记录精确发布版本、环境和脱敏结果。

- [ ] 9.11 编写手动交付和权益手册，使用沙箱或本地固定数据演练已付款订单核验、逐客户干净仓库和 ZIP 交付以及到期续费。
  - 目标路径（Paths）：`internal/vendor/fulfillment-runbook.md`、`internal/vendor/entitlement-schema.json`、`internal/evidence/m8/fulfillment/`。
  - 前置依赖（Depends）：9.3、9.10。
  - 验收证据（Evidence）：SC-COM-03、SC-COM-04、SC-COM-05、T46、T47、T50、T51；记录精确发布版本、环境和脱敏结果。

- [ ] 9.12 在全部部署和恢复指南编写后定稿销售站 Docs 导航及版本示例，再在 9.3 之前从规范内容重新生成同步的离线买家指南；最终产物及链接检查由 9.14 完成。
  - 目标路径（Paths）：`vendor/sales/app/`、`content/docs/`、`docs/buyer/`、`internal/evidence/m8/vendor-docs/`。
  - 前置依赖（Depends）：8.15、9.10、9.5、9.6、9.7、9.8、9.9。
  - 验收证据（Evidence）：SC-DOC-01、SC-DOC-02、SC-DOC-06、SC-DOC-07、SC-COM-01、T46、T56、T57、T58；记录精确发布版本、环境和脱敏结果。

- [ ] 9.13 记录商户资格及已批准许可、价格和源码联盟条款，十二个月基础支持范围及单独收费服务；将未解决商业输入标为发布阻塞项。
  - 目标路径（Paths）：`internal/vendor/commercial-readiness.md`、`vendor/sales/content/legal/`、`internal/evidence/m8/support-entitlement/`。
  - 前置依赖（Depends）：9.10、9.11。
  - 验收证据（Evidence）：SC-COM-04、SC-COM-05、SC-COM-06、SC-REL-12、T30、T51；记录精确发布版本、环境和脱敏结果。

- [ ] 9.14 使用 9.3 精确 ZIP 和仓库摘要，证明托管与 Docker 两种模式，以及 SC-OPS-13 后台和部署模式闭环、最终 Docs/导出、迁移恢复及受影响运营行为，并汇总 G01–G31/T01–T62。任何交付文件修复都会使证据失效：重新执行 9.3、重新生成归档，重跑 9.4 及受影响部署模式和契约流程后，再重新检查本门槛。
  - 目标路径（Paths）：`tests/release/`、`internal/evidence/m8/managed/`、`internal/evidence/m8/docker/`、`internal/evidence/m8/restore-drill/`、`internal/evidence/m8/operations-drill/`、`internal/evidence/m8/release-matrix.md`、`internal/evidence/m8/release-review.md`。
  - 前置依赖（Depends）：9.3、9.4、9.11、9.13、8.15、5.10、6.10、7.14。
  - 验收证据（Evidence）：SC-REL-01、SC-REL-02、SC-REL-03、SC-REL-04、SC-REL-05、SC-REL-06、SC-REL-07、SC-REL-08、SC-REL-09、SC-REL-10、SC-REL-11、SC-REL-12、SC-REL-13、SC-OPS-13、SC-DOC-01、SC-DOC-02、SC-DOC-06、SC-DOC-07、T01、T21、T25、T29、T30、T46、T47、T48、T49、T50、T53、T55、T56、T57、T58、T59、T60、T61、T62；记录精确发布版本、环境和脱敏结果。

- [ ] 9.15 M8 门槛（RC、BETA、STABLE 分别记录，只有 STABLE 通过才能完成）：仅接受由 9.4 和 9.14 证明且由 9.3 重新生成的精确候选，包含两条生产路径、SC-OPS-13 闭环、已取得版本权利、匹配 Docs 和完整 V1 证据；交付前立即复核产物摘要，受阻商业及真实操作仍保持未完成。
  - 子检查点：RC 接受候选并记录观察计划／窗口；BETA 确认完整范围和商业就绪；STABLE 确认代表性观察、缺陷关闭和当前字节证据。仅 BETA 通过仍不勾选本任务；就绪不表示已经发布。
  - 目标路径（Paths）：`internal/evidence/m8/gate.md`、`internal/evidence/m8/release-matrix.md`。
  - 前置依赖（Depends）：9.1、9.2、9.3、9.4、9.5、9.6、9.7、9.8、9.9、9.10、9.11、9.12、9.13、9.14。
  - 验收证据（Evidence）：SC-REL-01、SC-REL-02、SC-REL-03、SC-REL-04、SC-REL-05、SC-REL-06、SC-REL-07、SC-REL-08、SC-REL-09、SC-REL-10、SC-REL-11、SC-REL-12、SC-REL-13、SC-COM-01、SC-COM-02、SC-COM-03、SC-COM-04、SC-COM-05、SC-COM-06、SC-DOC-06、SC-DOC-07、SC-OPS-13、T01、T21、T25、T29、T30、T45、T46、T47、T48、T49、T50、T51、T52、T53、T55、T56、T57、T58、T60、T62、T59、T61；记录精确发布版本、环境和脱敏结果。
