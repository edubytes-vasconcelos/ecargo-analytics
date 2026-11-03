"""The API answers every question using the complete team and queue counts."""
import json
import unittest
from unittest.mock import patch
import project_manager_agent as agent


class ProjectManagerApiTests(unittest.TestCase):
    def setUp(self):
        self.project = {
            'name': agent.SUPPORTED_PROJECT_NAME,
            'workItemColumns': [{'id': 'dev', 'title': 'Em Desenv'}, {'id': 'waiting', 'title': 'Para Desenv'}],
            'workItems': [
                {'id': '1', 'title': 'Implementar taxas', 'assigneeId': 'a', 'assignee': 'Eduardo Samoggin', 'status': 'dev'},
                {'id': '2', 'title': 'Fila de espera', 'assigneeId': 'b', 'assignee': 'Bruno', 'status': 'waiting'},
                {'id': '3', 'title': 'Arquivada', 'assigneeId': 'c', 'assignee': 'Carla', 'status': 'dev', 'archived': True},
            ],
        }
        self.users = [
            {'id': 'a', 'name': 'Eduardo Samoggin', 'active': True, 'workRole': 'developer'},
            {'id': 'b', 'name': 'Bruno', 'active': True, 'workRole': 'developer'},
            {'id': 'c', 'name': 'Carla', 'active': True, 'workRole': 'tester'},
            {'id': 'd', 'name': 'Dora sem cards', 'active': True, 'workRole': 'po'},
            {'id': 'e', 'name': 'Inativo', 'active': False},
        ]

    def test_every_question_calls_api_with_history_and_team(self):
        history = [{'role': 'user', 'content': 'Quem está em desenvolvimento?'}]
        for question in ['atividades em desenvolvimento do Eduardo Samoggin',
                         'preciso dos que não tem atividade vinculadas na fila em desenvolvimento',
                         'riscos do projeto', 'resumo', 'quem está disponível?']:
            with self.subTest(question=question), patch.object(agent, '_openai_answer', return_value='Resposta da API') as api:
                result = agent.respond(self.project, question, history=history, users=self.users)
                api.assert_called_once_with(self.project, question, history, True, True, users=self.users)
                self.assertEqual(result['provider'], 'openai')
                self.assertEqual(result['answer'], 'Resposta da API')

    def test_api_failure_does_not_substitute_positive_card_list(self):
        with patch.object(agent, '_openai_answer', side_effect=RuntimeError('offline')):
            result = agent.respond(self.project, 'pessoas sem atividades em desenvolvimento', users=self.users)
        self.assertEqual(result['provider'], 'openai-error')
        self.assertIn('Não foi possível responder', result['answer'])
        self.assertNotIn('Implementar taxas', result['answer'])
        self.assertEqual(result['suggestions'], [])

    def test_team_context_includes_people_without_cards_and_zero_counts(self):
        context = json.loads(agent._openai_context(self.project, users=self.users))
        people = {person['nome']: person for person in context['equipe_ativa']}
        self.assertNotIn('Inativo', people)
        self.assertEqual(people['Eduardo Samoggin']['atividades_por_fila']['Em Desenv'], 1)
        self.assertEqual(people['Bruno']['atividades_por_fila']['Em Desenv'], 0)
        self.assertEqual(people['Bruno']['atividades_por_fila']['Para Desenv'], 1)
        self.assertEqual(people['Carla']['atividades_por_fila']['Em Desenv'], 0)
        self.assertEqual(people['Dora sem cards']['atividades_por_fila']['Em Desenv'], 0)
        self.assertEqual(people['Dora sem cards']['papel'], 'PO')

    def test_counts_include_cards_beyond_detail_limit(self):
        self.project['workItems'] = [{'title': str(i), 'assigneeId': 'a', 'status': 'dev'} for i in range(160)]
        context = json.loads(agent._openai_context(self.project, users=self.users))
        self.assertEqual(len(context['atividades_ativas']), 150)
        self.assertEqual(context['equipe_ativa'][0]['atividades_por_fila']['Em Desenv'], 160)

    def test_assignee_id_takes_precedence_over_duplicate_name(self):
        self.users.append({'id': 'f', 'name': 'Eduardo Samoggin', 'active': True})
        context = json.loads(agent._openai_context(self.project, users=self.users))
        self.assertEqual(context['equipe_ativa'][-1]['atividades_por_fila']['Em Desenv'], 0)


if __name__ == '__main__':
    unittest.main()
