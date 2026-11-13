# Fade House

A shared house whose housemates split chores and pay rent each month.
This bot assigns the chores and chases the rent.

## People and places

**Housemate**:
A person who lives on a Floor of the house.
_Avoid_: User, member, tenant

**Admin**:
A Housemate trusted to set Rent and correct other housemates' records.

**Floor**:
A level of the house that housemates live on (currently Floor 1 and Floor 3).
Floor 2 is communal space, so it is not a Floor in this sense; its chores are Global.
_Avoid_: Level, storey

## Chores

**Chore**:
A recurring task that stays in the pool and is handed out again every month until it is retired.
_Avoid_: Task, job

**Scope**:
Who is eligible for a Chore: either Global (every housemate) or a specific Floor (only housemates on that floor).

**Assignment**:
One Chore given to one Housemate for one month, completed once.
_Avoid_: Task, duty

**Overdue Assignment**:
An Assignment not completed by the end of its month, which stays with the same Housemate and stands in for that Chore in each following month until it is completed.
It is dropped if its Housemate leaves or its Chore is retired.
_Avoid_: Carry-over, backlog

## Rent

**Rent**:
The monthly amount a specific Housemate owes, which differs between housemates.

**Due Date**:
The 1st of the month, when the coming month's Rent is owed.

**Rent Reminder**:
A private daily message to a Housemate who has not yet marked their Rent paid, starting 3 days before the end of the month.
_Avoid_: Notification, nag
