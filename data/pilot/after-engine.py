
import random
from typing import List, Dict, Tuple, Union, Any, Optional, OrderedDict, Type
from GameEngine.utils.env_logger import EnvLogger
from GameEngine.utils.base_message import ObservationMsg, PayoffMsg, TurnEndMsg
from copy import deepcopy
from itertools import combinations

class LLMCard:
    """
    The base class for cards in LLM games.
    Use this as reference only. You are not allowed to modify this class.
    You don't need to repeat this class definition in your response.
    """

    def __init__(self, field: dict):
        """
        Initialize the class of LLMCard.
        For each field in the dict, add it as an attribute to the class.
        Compulsory fields: name, id.
        """
        for k, v in field.items():
            setattr(self, k, v)
        self.field = field
        self.str = self.get_str()

    def get_str(self):
        """
        Get the string representation of card by concatenating all fields.
        """
        field_list = [field for field in self.field.values() if field is not None]
        return '-'.join([str(k) for k in field_list])

    def __getitem__(self, key):
        return self.field[key]

    def __repr__(self) -> str:
        return self.get_str()

class DotDict(dict):
    """
    A dictionary subclass that supports attribute-style access
    for nested dictionaries.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for key, value in self.items():
            if isinstance(value, dict):
                self[key] = DotDict(value)

    def __getattr__(self, item):
        if item in self:
            return self[item]
        raise AttributeError(f"'DotDict' object has no attribute '{item}'")

    def __setattr__(self, key, value):
        self[key] = value

    def __delattr__(self, key):
        if key in self:
            del self[key]
        else:
            raise AttributeError(f"'DotDict' object has no attribute '{key}'")

    def __setitem__(self, key, value):
        if isinstance(value, dict):
            value = DotDict(value)
        super().__setitem__(key, value)

    # def __deepcopy__(self, memo):
    #     return DotDict(deepcopy(dict(self)))

def cards2list(cards: list[LLMCard]) -> list[str]:
    """ Get the corresponding string representation of cards"""
    cards_list = []
    for card in cards:
        cards_list.append(card.get_str())
    return cards_list

def get_observation(game_state: Dict) -> Dict:
    """
    Make a copy of the game state and remove the hidden and private information.
    for common_facedown, only keep the number of cards for list[card] fields.
    """
    observation = deepcopy(game_state)
    current_player_index = observation['common']['current_player']
    if 'players' in observation:
        for i, player in enumerate(observation['players']):
            if i != current_player_index:
                if 'private' in player:
                    player.pop('private')
                if 'facedown_cards' in player:
                    player['facedown_cards'] = {f"{k}_size": len(v) for k, v in player['facedown_cards'].items()}
            else:
                player['public']['current_player'] = True
    if 'facedown_cards' in observation['common']:
        result_dict = {}
        for k, v in observation['common']['facedown_cards'].items():
            if isinstance(v, list):
                result_dict[f"{k}_size"] = len(v)
            else:
                result_dict[k] = v
        observation['common']['facedown_cards'] = result_dict
    # Expose bust info publicly (that a bust occurred, not which card)
    if 'last_bust' in observation['common']:
        observation['common']['last_bust'] = {'player': observation['common']['last_bust']['player'], 'buried': True}
    return observation
    
class LLMGame:
    """
    The base class for LLM games.
    Use this as reference only. You are not allowed to modify this class.
    You don't need to repeat this class definition in your response.
    """

    def __init__(self, config: Dict):
        self.logger = EnvLogger(config)
        self.agents = None
        self.num_players = recommended_num_players if 'game_num_players' not in config or config['game_num_players'] is None else config['game_num_players']
        assert self.num_players is not None, "Please specify the number of players in the config"
        
        # Set random seed, default is None
        if 'seed' in config:
            random.seed(config['seed'])
        else:
            random.seed(None)

    def set_agents(self, agents):
        '''
        Set the agents that will interact with the environment.
        This function must be called before `run`.

        Args:
            agents (list): List of Agent classes
        '''
        self.agents = agents

    def reset(self) -> Tuple[Dict]:
        """ Reset the game to the initial state"""
        game_state = initiation(self.num_players, self.logger)
        return game_state

    def get_num_players(self) -> int:
        return self.num_players
    
    def run(self):
        game_state = self.reset()
        legal_actions = get_legal_actions(game_state)
        observation = get_observation(game_state)
        observation['legal_actions'] = legal_actions

        while not game_state['common']['is_over']:
            self.logger.append(game_state)

            current_player = game_state.common['current_player']
            self.logger.record(ObservationMsg(current_player, observation))
            
            action, _  = self.agents[current_player].eval_step(observation)
            self.logger.act(current_player, action)

            game_state = proceed_round(action, game_state, self.logger)
            legal_actions = get_legal_actions(game_state)
            observation = get_observation(game_state)
            observation['legal_actions'] = legal_actions
            self.logger.record(TurnEndMsg(current_player))
        
        payoffs = get_payoffs(game_state, self.logger)
        if self.logger.enable_info:
            self.logger.info(f"Game over. Payoffs for each player: {payoffs}")
        else:
            self.logger.record(PayoffMsg(payoffs))
        return payoffs

"""Beginning of the game code"""
game_name = 'CrazyEights'
recommended_num_players = 4
num_players_range = [2, 3, 4, 5]


def init_deck() -> List[LLMCard]:
    """Initialize a standard 52-card deck."""
    deck = []
    ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    suits = ['hearts', 'diamonds', 'clubs', 'spades']
    for suit in suits:
        for rank in ranks:
            deck.append(LLMCard({'rank': rank, 'suit': suit}))
    random.shuffle(deck)
    return deck


def initiation(num_players: int, logger) -> DotDict:
    """Initialize the game state."""
    game_state = DotDict({
        'common': {
            'num_players': num_players,
            'current_player': 0,
            'winner': None,
            'is_over': False,
            'current_suit': None,
            'declared_suit': None,
            'pass_count': 0,
            'facedown_cards': {
                'deck': init_deck(),
            },
            'faceup_cards': {
                'played_cards': [],
                'target_card': None,
            },
        },
        'players': [
            DotDict({
                'public': {
                    'hand_size': 0,
                },
                'private': {},
                'facedown_cards': {
                    'hand': [],
                },
                'faceup_cards': {},
            })
            for _ in range(num_players)
        ],
    })
    game_state = init_deal(game_state, logger)
    return game_state


def init_deal(game_state: DotDict, logger) -> DotDict:
    """Deal 5 cards to each player and set up the starter pile."""
    logger.info("Dealing 5 cards to each player...")
    deck = game_state.common.facedown_cards.deck
    num_players = game_state.common.num_players

    for i in range(num_players):
        game_state.players[i].facedown_cards.hand = [deck.pop() for _ in range(5)]
        game_state.players[i].public.hand_size = 5

    # Turn up the top card for the starter pile
    # If it's an eight, bury it in the middle of the stock and try again
    card = deck.pop()
    while card.field['rank'] == '8':
        mid = len(deck) // 2
        deck.insert(mid, card)
        logger.info(f"Starter card was an 8, burying it. Drawing next card...")
        card = deck.pop()

    game_state.common.faceup_cards.played_cards.append(card)
    game_state.common.faceup_cards.target_card = card
    game_state.common.current_suit = card.field['suit']
    game_state.common.declared_suit = None

    logger.info(f"Starter card: {card.get_str()}. Current suit: {card.field['suit']}")
    return game_state


def card_point_value(card: LLMCard) -> int:
    """Calculate the point value of a card."""
    rank = card.field['rank']
    if rank == '8':
        return 50
    elif rank in ['K', 'Q', 'J', '10']:
        return 10
    elif rank == 'A':
        return 1
    else:
        return int(rank)


def is_playable(card: LLMCard, game_state: DotDict) -> bool:
    """Check if a card is playable given the current game state."""
    if card.field['rank'] == '8':
        return True
    if game_state.common.declared_suit is not None:
        return card.field['suit'] == game_state.common.declared_suit
    target = game_state.common.faceup_cards.target_card
    return card.field['suit'] == target.field['suit'] or card.field['rank'] == target.field['rank']


def proceed_round(action: dict, game_state: DotDict, logger) -> DotDict:
    """Process the action and update the game state."""
    current_player = game_state.common.current_player
    player = game_state.players[current_player]
    hand = player.facedown_cards.hand
    num_players = game_state.common.num_players

    if action['action'] == 'play':
        card_idx = action['args']['card_idx']
        card = hand.pop(card_idx)
        game_state.common.faceup_cards.played_cards.append(card)
        game_state.common.faceup_cards.target_card = card
        game_state.common.pass_count = 0

        if card.field['rank'] == '8':
            declared_suit = action['args']['declared_suit']
            game_state.common.declared_suit = declared_suit
            game_state.common.current_suit = declared_suit
            logger.info(f"Player {current_player} plays {card.get_str()} and declares suit: {declared_suit}.")
        else:
            game_state.common.declared_suit = None
            game_state.common.current_suit = card.field['suit']
            logger.info(f"Player {current_player} plays {card.get_str()}.")

        player.public.hand_size = len(hand)

        if len(hand) == 0:
            game_state.common.is_over = True
            game_state.common.winner = current_player
            logger.info(f"Player {current_player} wins by emptying their hand!")
        else:
            game_state.common.current_player = (current_player + 1) % num_players

    elif action['action'] == 'draw':
        # Gamble Draw: draw up to 3 cards, must play immediately if playable
        draw_count = action['args'].get('draw_count', 1)
        draw_count = min(draw_count, 3, len(game_state.common.facedown_cards.deck))
        drew_playable = False
        played_card = None
        for _ in range(draw_count):
            if len(game_state.common.facedown_cards.deck) == 0:
                break
            card = game_state.common.facedown_cards.deck.pop()
            hand.append(card)
            player.public.hand_size = len(hand)
            logger.info(f"Player {current_player} draws a card. Hand size: {len(hand)}. Stock remaining: {len(game_state.common.facedown_cards.deck)}.")
            if is_playable(card, game_state):
                # Must play immediately
                drew_playable = True
                played_card = card
                hand.remove(card)
                game_state.common.faceup_cards.played_cards.append(card)
                game_state.common.faceup_cards.target_card = card
                game_state.common.pass_count = 0
                if card.field['rank'] == '8':
                    declared_suit = action['args'].get('declared_suit', 'hearts')
                    game_state.common.declared_suit = declared_suit
                    game_state.common.current_suit = declared_suit
                    logger.info(f"Player {current_player} draws and plays {card.get_str()} and declares suit: {declared_suit}.")
                else:
                    game_state.common.declared_suit = None
                    game_state.common.current_suit = card.field['suit']
                    logger.info(f"Player {current_player} draws and plays {card.get_str()}.")
                player.public.hand_size = len(hand)
                if len(hand) == 0:
                    game_state.common.is_over = True
                    game_state.common.winner = current_player
                    logger.info(f"Player {current_player} wins by emptying their hand!")
                else:
                    game_state.common.current_player = (current_player + 1) % num_players
                break
        if not drew_playable:
            cards_drawn = draw_count
            if cards_drawn >= 3:
                # Bust: bury highest-value card from hand at bottom of stock
                if len(hand) > 0:
                    max_val = max(card_point_value(c) for c in hand)
                    # Player chooses which to sacrifice; for determinism pick first max
                    bust_idx = action['args'].get('bust_card_idx', None)
                    if bust_idx is not None and 0 <= bust_idx < len(hand) and card_point_value(hand[bust_idx]) == max_val:
                        bust_card = hand.pop(bust_idx)
                    else:
                        bust_idx = next(i for i, c in enumerate(hand) if card_point_value(c) == max_val)
                        bust_card = hand.pop(bust_idx)
                    game_state.common.facedown_cards.deck.insert(0, bust_card)
                    player.public.hand_size = len(hand)
                    game_state.common['last_bust'] = {'player': current_player, 'buried': True}
                    logger.info(f"Player {current_player} busts! Buries highest-value card face-down at bottom of stock.")
                game_state.common.pass_count += 1
                game_state.common.current_player = (current_player + 1) % num_players
                if game_state.common.pass_count >= num_players:
                    game_state.common.is_over = True
                    min_points = float('inf')
                    winner = 0
                    for i in range(num_players):
                        points = sum(card_point_value(c) for c in game_state.players[i].facedown_cards.hand)
                        if points < min_points:
                            min_points = points
                            winner = i
                    game_state.common.winner = winner
                    logger.info(f"All players passed consecutively. Player {winner} wins with lowest hand value ({min_points} points).")
            else:
                # Drew 1 or 2 non-playable cards and chose to stop: pass
                game_state.common.pass_count += 1
                game_state.common.current_player = (current_player + 1) % num_players
                if game_state.common.pass_count >= num_players:
                    game_state.common.is_over = True
                    min_points = float('inf')
                    winner = 0
                    for i in range(num_players):
                        points = sum(card_point_value(c) for c in game_state.players[i].facedown_cards.hand)
                        if points < min_points:
                            min_points = points
                            winner = i
                    game_state.common.winner = winner
                    logger.info(f"All players passed consecutively. Player {winner} wins with lowest hand value ({min_points} points).")

    elif action['action'] == 'pass':
        game_state.common.pass_count += 1
        logger.info(f"Player {current_player} passes. Consecutive passes: {game_state.common.pass_count}.")
        game_state.common.current_player = (current_player + 1) % num_players

        if game_state.common.pass_count >= num_players:
            game_state.common.is_over = True
            min_points = float('inf')
            winner = 0
            for i in range(num_players):
                points = sum(card_point_value(c) for c in game_state.players[i].facedown_cards.hand)
                if points < min_points:
                    min_points = points
                    winner = i
            game_state.common.winner = winner
            logger.info(f"All players passed consecutively. Player {winner} wins with lowest hand value ({min_points} points).")

    return game_state


def get_legal_actions(game_state: DotDict) -> list:
    """Get all legal actions for the current player."""
    if game_state.common.is_over:
        return [{'action': 'pass'}]

    current_player = game_state.common.current_player
    player = game_state.players[current_player]
    hand = player.facedown_cards.hand
    legal_actions = []

    # Check for playable cards
    for i, card in enumerate(hand):
        if card.field['rank'] == '8':
            for suit in ['hearts', 'diamonds', 'clubs', 'spades']:
                legal_actions.append({
                    'action': 'play',
                    'args': {'card_idx': i, 'declared_suit': suit}
                })
        elif is_playable(card, game_state):
            legal_actions.append({
                'action': 'play',
                'args': {'card_idx': i}
            })

    # Can draw if stock is not empty (Gamble Draw: specify draw_count 1-3)
    if len(game_state.common.facedown_cards.deck) > 0:
        max_draw = min(3, len(game_state.common.facedown_cards.deck))
        for dc in range(1, max_draw + 1):
            legal_actions.append({'action': 'draw', 'args': {'draw_count': dc}})

    # Can pass if no playable cards and stock is empty, or player chooses to stop
    has_playable = any(is_playable(c, game_state) for c in hand)
    if not has_playable and len(game_state.common.facedown_cards.deck) == 0:
        legal_actions.append({'action': 'pass'})
    elif not legal_actions:
        legal_actions.append({'action': 'pass'})

    assert legal_actions is not None and len(legal_actions) > 0
    return legal_actions


def get_payoffs(game_state: DotDict, logger) -> List[Union[int, float]]:
    """Calculate payoffs for each player."""
    num_players = game_state.common.num_players
    payoffs = [0] * num_players
    winner = game_state.common.winner

    if winner is not None:
        for i in range(num_players):
            if i != winner:
                hand_value = sum(card_point_value(c) for c in game_state.players[i].facedown_cards.hand)
                payoffs[i] = -hand_value
                payoffs[winner] += hand_value
                logger.info(f"Player {i} pays {hand_value} points (remaining hand value).")
        logger.info(f"Player {winner} wins with total payoff of {payoffs[winner]} points.")

    return payoffs
"""End of the game code"""