# 免责声明 · Disclaimer

> 本文件是**使用条款**，与 [`LICENSE`](LICENSE)（MIT）并存。两者冲突时，以**更严格**的一条为准。
> **下载、clone、安装、运行或以任何方式使用本仓库（含文档与脚本），即视为你已阅读、理解并同意以下全部内容。**
> 如果你不同意，请立即停止使用并删除本仓库的全部副本。

最后更新：2026-11-02 ｜ 对应版本：v1.6.30

---

## 一、非官方，与厂商无关联

本项目是**第三方、非官方**的技术文档与自动化脚本集合，整理自对旺云商户端（`https://wyb.5188cloud.net`）
公开界面的实际操作记录。

- **与旺云、5188cloud、旺旺吧、旺旺宝、云管家等产品及其运营方的任何公司，均无隶属、合作、代理、
  授权、认可或赞助关系。** 本项目不代表上述任何一方的立场，其内容也未经任何一方审阅或背书。
- 上述产品名称、商标、Logo、界面文案归各自权利人所有，本仓库仅在**描述性、指称性**意义上提及，
  不主张任何权利，也不构成商标许可。
- 本仓库**不是**官方文档。官方口径以厂商发布的文档、客服答复和后台实际行为为准。
  本仓库与官方文档不一致时，**以官方为准**；请同时把差异提成 Issue 告知我们。

## 二、仅限合法、经授权的用途

本仓库仅允许用于**合法且已获授权**的场景：

**允许**

- 你自己经营、或你受雇 / 受托管理、且已获得场所负责人**明确书面或口头授权**的网吧 / 网咖后台。
- 在自有账号、自有场所内做配置、核对、批量录入、数据统计等日常运营工作。
- 学习、研究后台的字段语义与操作路径（在自有或已获授权的测试场所内）。

**禁止**

- 未获授权访问、登录、操作**任何第三方**的账号、场所或数据。
- 绕过、破解、规避平台的登录、鉴权、风控、限流、加密或其他安全机制；
  以技术手段伪造身份、冒用他人账号、越权提权。
- 使用本项目对平台进行压力测试、漏洞利用、拒绝服务攻击，或抓取、囤积超出你业务必要范围的平台数据。
- **采集、导出、存储、转卖或传播会员个人信息**，包括但不限于姓名、身份证号、手机号、人脸 /
  刷脸特征、上机记录、消费记录、位置信息。
- 未经审核擅自向全体会员群发通知、短信、营销内容（可能构成骚扰，且平台对发送内容有留存与追溯）。
- 任何违反中华人民共和国法律法规、公序良俗，或违反平台服务协议的行为。

**违法后果自负。** 上述行为可能触犯《中华人民共和国网络安全法》《数据安全法》《个人信息保护法》
《民法典》《治安管理处罚法》，情节严重的可能构成《刑法》第二百五十三条之一（侵犯公民个人信息罪）、
第二百八十五条（非法侵入计算机信息系统罪、非法获取计算机信息系统数据罪）、
第二百八十六条（破坏计算机信息系统罪）等。**本项目作者不参与、不协助、不支持任何此类行为。**

## 三、账号与凭据：全程由你本人掌握

- 本仓库**不包含、不索取、不记录、不上传**任何账号、密码、短信验证码、Cookie、Token 或登录态。
- 所有登录必须由使用者**本人在自己的浏览器中手动完成**。脚本复用的只是你本机已经登录的浏览器会话。
- 请自行保管账号凭据，不要在 Issue、截图、日志或公开渠道泄露。**在提交 Issue 前，请先打码场所名、
  场所编号、姓名、手机号、身份证号与任何金额明细。**
- 若你发现本仓库中存在疑似真实凭据或个人信息的残留，请立刻通过 Issue 告知，我们会尽快清除。

## 四、⚠️ 操作风险：这些脚本会真的改数据

这是**写操作自动化**，不是只读演示。脚本一旦以非 `DRY_RUN` / `SAVE=true` 运行，
**会真实修改线上后台数据，且部分操作不可撤销**。已知的高风险动作包括：

| 动作 | 可能的后果 |
|---|---|
| 改商品价格 / 库存 | 影响收银结算、账面库存，错价可能被顾客立即下单 |
| 删除商品、套餐、设备、部门、员工 | 关联的历史订单、提成、统计口径可能一并受影响 |
| 作废提成规则 | 已产生的提成可能不再结算，员工薪资争议 |
| 向全体会员发通知 / 短信 | 一次性触达全部会员，**发出后无法撤回**，且产生短信费用 |
| 上架团购券 / 改库存 | 顾客可立即购买，超卖后需人工赔付 |
| 改计费、区域费率、占座配置 | 直接影响机位定价与顾客体验，且部分页面标注「当前版本无法修改」 |

**强制要求（请务必逐条执行）**

1. **先读后写**：第一次接触任何页面，先用只读脚本或手动点一遍，确认字段含义再动写脚本。
2. **保持 `DRY_RUN` / `SAVE=false` 默认开**：先只填不存，把回读结果逐项核对无误后，再改成落库。
3. **先在测试场所 / 测试数据上验证**，不要拿正在营业的门店做第一次试验。
4. **改前留痕**：对配置类操作（费率、提成、计费）先截图或导出原文，便于回滚。
   ⚠️ 本仓库**不提供**任何自动备份或回滚能力。
5. **高风险操作要有人在场**：群发通知、批量改价、删除多行数据，务必两人复核。
6. **遵守后台自身的权限边界**：遇到「当前版本无法修改」「权限不足」的提示，不要尝试用脚本绕过。

## 五、无担保（AS IS）

本仓库按「现状」提供，**不附带任何明示或默示的担保**，包括但不限于对**准确性、完整性、
时效性、适销性、特定用途适用性、不侵权**的担保。

具体而言，你需要知道：

- 文档是**采集当时的快照**，平台随时可能改版、改字段、改接口、改校验规则，本仓库不承诺跟进。
- 大量结论标注为「未验证」，那是**没样本硬撑**，不是遗漏——**不要当成结论使用**。
- 脚本依赖第三方工具（`playwright-cli`、Playwright、Node、Pillow）与浏览器行为，
  第三方升级可能导致脚本失效或行为改变。
- 后台本身存在已知的费率量级矛盾（见 `references/04-区域费率.md`），本仓库只如实转录，不做解释。

## 六、责任限制

在适用法律允许的最大范围内，**作者及贡献者不对因使用或无法使用本仓库而产生的任何直接、间接、
附带、特殊、惩罚性或后果性损失承担责任**，包括但不限于：利润损失、营业中断、数据丢失或损坏、
账号封禁或处罚、对第三方的赔偿、因错价 / 超卖 / 误删 / 误发通知导致的赔付。

**你使用本仓库的全部风险由你自行承担。**

> 说明：本条不排除或限制依照中华人民共和国法律**不得排除或限制**的责任（例如因故意或重大过失
> 造成他人人身损害的责任）。若本条与强制性法律规定冲突，以法律规定为准。

## 七、第三方与平台条款优先

- 使用本项目时，你仍需**独立遵守**平台（旺云 / 5188cloud 等）的服务协议、接口使用规则与
  数据合规要求。若平台条款禁止自动化操作，**以平台条款为准，请停止使用本项目的写脚本**。
- 本仓库中提到的第三方产品、服务、链接仅为说明用途，作者不对其内容、可用性与安全性负责。

## 八、通知与删除（Notice & Takedown）

- 若你是权利人，认为本仓库内容侵犯了你的著作权、商标权、商业秘密或其他合法权益，
  请通过 [Issues](https://github.com/960427357/wangyun-netbar-ops/issues) 说明具体条目与权利依据，
  我们会在核实后**及时修改或删除**相关内容。
- 若你发现仓库内含有不应公开的真实门店数据、个人信息或凭据，同样请通过 Issue 告知，我们会尽快处理。

## 九、条款修订

本免责声明可能随项目迭代而更新，更新后自推送至 `main` 分支之时生效，不另行单独通知。
请在使用前查看本文件的最新版本。

---

## English Summary (non-binding)

This is an **unofficial, third-party** collection of documentation and Playwright automation
scripts for the Wangyun merchant console (a cybercafé SaaS admin panel). It is **not affiliated
with, endorsed by, or authorized by** Wangyun / 5188cloud / Wangwangba or any of their operators.
All trademarks belong to their respective owners.

**Permitted use only:** lawful operation on venues and accounts that you own or are explicitly
authorized to manage. **Prohibited:** unauthorized access, bypassing authentication or security
controls, harvesting or distributing members' personal data (names, ID numbers, phone numbers,
facial-recognition data, session records), spamming members, or any use that violates applicable
law (including the PRC Cybersecurity Law, Data Security Law, and Personal Information Protection Law)
or the platform's terms of service.

These scripts perform **real write operations** on a production admin panel — pricing, inventory,
deletions, commission rules, and mass member notifications — some of which **cannot be undone**.
Always run with `DRY_RUN` / `SAVE=false` first, validate on a test venue, and keep your own backups.
No backup or rollback capability is provided.

The software is provided **"AS IS", without warranty of any kind**, express or implied. To the
maximum extent permitted by law, the authors accept **no liability** for any damages arising from
its use. Nothing herein excludes liability that cannot be excluded under applicable law.

By using this repository you accept these terms. If you do not agree, stop using it and delete all
copies.
