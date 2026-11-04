# Manual de uso da gestão de atividades

## E-Cargo | Guia para gerentes de projeto, desenvolvimento e testes

Atualizado em 3 de novembro de 2026

Este guia mostra como registrar e acompanhar atividades de um projeto no painel, organizar o trabalho no Kanban, conversar sobre os cards e anexar evidências. Use o botão **Manual** no cabeçalho do aplicativo para consultar este procedimento sem sair da tela.

## 1. Acessar um projeto

1. Entre no portal E-Cargo e abra **Evolutivas**.
2. Selecione o projeto que receberá as atividades.
3. Localize a área **Atividades do projeto**. Para criar ou alterar atividades, conversar, anexar arquivos e receber notificações pessoais, entre com uma conta ativa.

## 2. Acompanhar evolutivas no dashboard

1. A gestão abre com o filtro **Em andamento**. Use **Todos**, **Em andamento** ou **Concluídos** para consultar evolutivas e estudos. Os números mostram a quantidade em cada situação.
2. Em um card de evolutiva, selecione **Concluir projeto**; em um card de estudo, selecione **Concluir estudo**. Essas ações e as opções **Reabrir projeto** ou **Reabrir estudo** não exigem login. A conclusão fica salva no respectivo item.
3. Para retomar o trabalho, selecione **Reabrir projeto** ou **Reabrir estudo**. O item volta para **Em andamento**.
4. A conclusão do projeto é independente da etapa dos cards de atividade: concluir o projeto não fecha nem move suas atividades automaticamente.

## 3. Registrar uma atividade

1. Selecione **Nova atividade**.
2. Informe um título curto que descreva o resultado esperado.
3. Escolha o tipo: **Análise de Requisitos**, **Definição Técnica** ou **Bug**.
4. Escreva a descrição no editor visual. Selecione um trecho e use a barra para aplicar negrito, itálico, título, listas, citação, código ou link. Cole uma imagem com **Ctrl+V** ou use **Imagem** na barra. Para requisitos, registre contexto e critérios de aceite; para bugs, descreva o comportamento observado, o esperado e os passos para reproduzir.
5. Em atividades do tipo **Definição Técnica**, informe, se disponíveis, até três links de código no GitHub: um de **Frontend**, um de **Backend** e um de **Serviço**. Informe também o link do pacote de implantação.
6. Defina a **Etapa**, o **Responsável**, a **Prioridade** e, quando aplicável, o **Prazo** e a **Próxima ação**.
7. Use **Vincular a** para relacionar uma Definição Técnica à Análise de Requisitos correspondente ou um bug à Definição Técnica afetada.
8. Registre **Critérios de conclusão** e inclua itens no **Checklist** quando a atividade exigir etapas menores.
9. Se houver um impedimento manual, marque **Bloqueada por outro motivo** e descreva a causa. Salve a atividade.

## 4. Organizar o trabalho no Kanban

Use o seletor de visualização para alternar entre **Kanban**, **Lista** e **Por etapa**. Sua última escolha entre essas visualizações fica salva neste navegador para sua conta e é aplicada ao abrir qualquer evolutiva. No Kanban, cada lista representa uma etapa e cada card representa uma atividade. Arraste um card para outra lista ou use **Mover para** no menu do card. O nome da lista é a etapa do card; não há um segundo status independente.

| Tipo | Etapas disponíveis |
|---|---|
| Análise de Requisitos | Não iniciada · Em análise · Aprovada · Bloqueada |
| Definição Técnica | Não iniciada · Em definição · Pronta para teste · Em teste · Concluída · Bloqueada |
| Bug | Aberto · Em correção · Pronto para reteste · Bloqueado · Fechado |

Use os filtros para encontrar atividades atrasadas, bloqueadas, sem responsável, próximas do prazo, atribuídas a você ou que mencionaram você. Cada lista também tem um filtro de responsável, incluindo a opção **Sem responsável**. Segure a barra de espaço e arraste com o mouse para deslocar o quadro; cada lista pode rolar verticalmente.

## 5. Registrar e acompanhar bugs

1. Abra a Definição Técnica afetada e crie uma atividade do tipo **Bug**.
2. Confirme o vínculo com a Definição Técnica e atribua um responsável.
3. Preencha a severidade (baixa, moderada, alta ou crítica) e o ambiente (por exemplo, HML, navegador e sistema operacional).
4. Descreva os passos para reproduzir em ordem, além do resultado esperado e do resultado observado. Anexe evidências na aba **Evidências**.
5. Atualize a etapa do bug conforme o trabalho avançar: **Aberto**, **Em correção**, **Pronto para reteste**, **Bloqueado** ou **Fechado**.
6. Depois da correção, mova para **Pronto para reteste**. O testador registra o resultado na conversa e fecha o bug se a validação passar; se falhar, descreve o novo resultado e devolve o card ao fluxo de correção.

Use um título curto que identifique o problema e evite incluir senhas, tokens ou dados pessoais nas evidências. A severidade indica impacto; a prioridade indica ordem de trabalho e pode ser definida separadamente.

Bugs abertos vinculados a uma Definição Técnica aparecem como uma pendência nessa definição. O alerta não muda automaticamente a etapa da definição. Ele desaparece quando todos os bugs vinculados forem fechados ou arquivados. Se houver outro impedimento, registre-o separadamente em **Bloqueada por outro motivo**.

## 6. Conversar e notificar pessoas

1. Abra uma atividade já salva e escolha a aba **Conversa**.
2. Escreva a mensagem. Para mencionar alguém, digite **@** e selecione a pessoa na lista sugerida. Escrever o nome sem selecionar não cria uma menção.
3. Selecione **Enviar mensagem**. A pessoa mencionada recebe uma notificação no painel e por e-mail. O responsável também pode receber avisos; ao responder uma mensagem, seu autor também é notificado.
4. O autor da mensagem não recebe uma notificação de si mesmo. Para pedir uma ação, mencione outra pessoa ativa.
5. Use **Responder** para manter uma mensagem ligada ao comentário original.

## 7. Anexar evidências e consultar o histórico

Na aba **Evidências**, selecione arquivos, arraste-os para a área indicada ou cole uma captura de tela com **Ctrl+V**. Cada arquivo pode ter até 20 MB. Aguarde o envio terminar antes de fechar a atividade.

Abra **Histórico** para consultar alterações registradas na atividade. Use o Checklist para acompanhar passos menores sem criar um card para cada ação.

## 8. Usar o modo escuro

No cabeçalho, selecione o ícone de lua para ativar o modo escuro. Selecione o ícone de sol para voltar ao modo claro. A escolha fica salva neste navegador e não altera a aparência dos outros usuários.

## 9. Usar o assistente de gestão do projeto

No projeto **Reforma Tributária - escopo Novas taxas e Novas adequações fiscais**, abra a visualização **Kanban** e selecione **Assistente de gestão**. O recurso está disponível somente para administradores. Use os atalhos ou escreva uma pergunta sobre status, riscos e atrasos, cobranças, responsáveis, distribuição de trabalho, próximas ações ou pauta de reunião. Sem uma chave OpenAI configurada, o assistente usa regras internas sobre os cards. Com a chave configurada, envia a pergunta, o histórico recente e campos das atividades para a API OpenAI e usa o modelo definido no ambiente; a conversa não é salva pelo app. A API aplica seus próprios controles de retenção: consulte [Controles de dados da OpenAI](https://developers.openai.com/api/docs/guides/your-data). O assistente não altera cards automaticamente.

Para preparar uma cobrança, pergunte **Quem preciso cobrar?**. O assistente sugere atividades vencidas ou com prazo nos próximos sete dias que tenham responsável. Selecione **Preparar cobrança** para abrir a conversa daquela atividade com uma mensagem em rascunho. Revise o texto, confirme a pessoa mencionada e selecione **Enviar mensagem** quando quiser enviar. Fechar a conversa sem enviar descarta o rascunho.

Atividades na etapa **Em Homol** aguardam validação do cliente. O assistente as mostra separadamente como pendências externas, sem classificá-las como atraso nem sugerir cobrança para a equipe interna.

Use o resumo e a pauta como apoio para reuniões. Se uma atividade estiver sem responsável, prazo ou próxima ação, atualize esses dados no card antes de tomar uma decisão. As recomendações refletem somente o que está preenchido no painel.

## 10. Boas práticas por perfil

- **Gerente de projeto:** acompanhe responsáveis, prazos e bloqueios; use filtros de atenção para preparar alinhamentos.
- **Desenvolvedor:** registre decisões e próximas ações na atividade; mantenha o bug vinculado à Definição Técnica e atualize sua etapa.
- **Testador:** valide cards em **Pronta para teste** ou bugs em **Pronto para reteste**; registre evidências e o resultado na conversa.

## Se uma pessoa não receber a notificação

Confirme se ela foi selecionada na lista de sugestões após digitar **@**, se a conta está ativa e se o comentário foi enviado. Uma menção digitada como texto comum não dispara notificação. O próprio autor da mensagem é excluído dos destinatários.

### Implantação de artefatos técnicos

O fluxo final das Definições Técnicas é **Agendado para implantação → Implantado em produção**. A última lista representa a conclusão do artefato. Registros anteriormente concluídos aparecem nessa lista.

Para agendar ou registrar a implantação, inclua ao menos um item no checklist e marque todos como concluídos, informe ao menos um link de código e o link HTTPS do pacote de implantação. Todos os bugs ativos vinculados precisam estar encerrados por um testador ou administrador. É necessário passar pelo agendamento antes de registrar a implantação em produção.

Reabrir ou criar um bug pendente em um artefato agendado ou implantado devolve o artefato para teste. Concluir o projeto continua sendo uma ação independente.
