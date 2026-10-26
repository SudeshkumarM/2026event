import json
from datetime import datetime

class AntiCheatEngine:
    @staticmethod
    def validate_session_result(session, telemetry, config):
        """
        Validates client game telemetry against server rules.
        Returns: (is_valid: bool, cleaned_data: dict, error_message: str)
        """
        score = telemetry.get('score', 0)
        hits = telemetry.get('hits', 0)
        misses = telemetry.get('misses', 0)
        total_shots = telemetry.get('total_shots', hits + misses)
        best_combo = telemetry.get('best_combo', 0)
        targets_destroyed = telemetry.get('targets_destroyed', hits)
        duration_ms = telemetry.get('duration_ms', 0)
        shots_data = telemetry.get('shots_telemetry', [])

        # Rule 1: No negative numbers
        if score < 0 or hits < 0 or misses < 0 or total_shots < 0:
            return False, None, "Invalid negative statistics reported."

        # Rule 2: Hits cannot exceed total shots fired
        if hits > total_shots:
            return False, None, f"Hit count ({hits}) cannot exceed total shots fired ({total_shots})."

        # Rule 3: Time-based event validity (MODE_TARGETS 20-limit removed)
        # All tournament sessions are strictly time-based (e.g. 420 seconds)

        # Rule 4: Game duration sanity check (e.g. must take at least 5 seconds for a real human team)
        if duration_ms < 5000 and (hits > 5 or score > 500):
            return False, None, "Impossible game completion time (too fast for human play)."

        # Rule 5: Shot rate frequency / bot check
        if shots_data and len(shots_data) > 1:
            rapid_fire_anomalies = 0
            for i in range(1, len(shots_data)):
                diff = shots_data[i].get('t', 0) - shots_data[i-1].get('t', 0)
                if diff < 70:  # Less than 70ms between shots indicates automated macro/script
                    rapid_fire_anomalies += 1
            if rapid_fire_anomalies > 8:
                return False, None, "Unnatural rapid-fire inputs detected (bot/macro protection triggered)."

        # Rule 6: Accuracy computation (recalculated on server)
        actual_shots = max(1, total_shots)
        recalculated_accuracy = round((hits / actual_shots) * 100.0, 1)

        # Rule 7: Score boundary verification
        # Engine scoring formula per hit:
        # (baseScore [100-200] + archBonus [0-150]) * chapterMultiplier [1.0 - 1.45] + comboBonus [up to 250]
        # Maximum theoretical single-hit score is ~760 points
        max_possible_score = int(hits * 800) + 1000
        if hits == 0 and score > 0:
            score = 0
        elif score > max_possible_score and hits > 0:
            # Score exceeds physical engine maximum; cap to theoretical ceiling
            score = max_possible_score

        validated_record = {
            "score": score,
            "hits": hits,
            "misses": misses,
            "total_shots": total_shots,
            "accuracy": recalculated_accuracy,
            "best_combo": best_combo,
            "targets_destroyed": targets_destroyed,
            "duration_ms": duration_ms
        }

        return True, validated_record, None
