class TileMatcher extends pc.ScriptType {

    initialize(): void {
        this.app.on(constants.CHECK_FOR_MATCHES, this.checkForMatches, this);
    }

    checkForMatches(isFirstMatchCheck: boolean = false) {
        // search all rows first
        const matches: TileWithGridCoords[] = [];
        this.findAllRowMatches(matches);
        this.findAllColumnMatches(matches);
        this.checkMatchesForDuplicates(matches);

        if(!matches.length)  {
            this.endOfMatching();
            return;
        }

        if(!isFirstMatchCheck) {
            gameModel.comboCount++;
            setTimeout(() => {
                this.animateMatches(matches);
            }, 1000);
        }
        else {
            this.animateMatches(matches);
        }
    }

    endOfMatching() {
        // matches finished fire event to spawn next tile.
        gameModel.comboCount = 0;
        // spawn a new player tile
        this.app.fire(constants.ACTION_SPAWN_NEW_PLAYER_TILE);
        gameModel.playerTile!.setPosition(gameModel.playerTileSpawnPos);
        gameModel.inputEnabled = true;
    }

    animateMatches(matches: TileWithGridCoords[]) {
        this.app.once(constants.ANIM_DESTROYING_FINISHED, () => {
            matches.forEach(match => this.moveRemainingColumnTiles(match.colIndex));
        }, this);

        this.app.once(constants.ANIM_DROPS_FINISHED, () => this.app.fire(constants.CHECK_FOR_MATCHES), this);

        this.destroyMatchingTiles(matches);
    }

    findAllRowMatches(matchesArray: TileWithGridCoords[]): void {
        for(let boardRowIndex = 0; boardRowIndex < gameModel.boardSlots.length; boardRowIndex++) {
            const boardRow = gameModel.boardSlots[boardRowIndex];

            let linkedTileCount = 0;
            let currentLinkedTiles: TileWithGridCoords[] = [];
            for(let boardColumnIndex = 0; boardColumnIndex < boardRow.length; boardColumnIndex++) {
                const slot = boardRow[boardColumnIndex];
                
                if(slot) {
                    linkedTileCount++;
                    currentLinkedTiles.push({ tile: slot, rowIndex: boardRowIndex, colIndex: boardColumnIndex, isRowMatch: true, isColumnMatch: false});
                }

                // A single row can have multiple sets of linked tiles.
                // When encountering a null slot we check to see if the current set of linked tiles contain any matches,
                // then reset the linked tile counter and clear the currentLinkesTiles array ready to fill with another set of linked tiles.
                if((slot === null && linkedTileCount) || (boardColumnIndex === boardRow.length-1 && linkedTileCount)) {
                    currentLinkedTiles.forEach((linkedTile: TileWithGridCoords) => {
                        if(this.convertTileNameToNumber(linkedTile.tile.name as TileAliases) === linkedTileCount) {
                            matchesArray.push(linkedTile);
                        }
                    });

                    linkedTileCount = 0;
                    currentLinkedTiles.splice(0, currentLinkedTiles.length);
                }
            }
        }
    }

    findAllColumnMatches(matchesArray: TileWithGridCoords[]): void {
        for(let boardColumnIndex = 0; boardColumnIndex < gameModel.boardSlots[0].length; boardColumnIndex++) {

            let linkedTileCount = 0;
            let currentLinkedTiles: TileWithGridCoords[] = [];
            for(let boardRowIndex = 0; boardRowIndex < gameModel.boardSlots.length; boardRowIndex++) {
                const slot = gameModel.boardSlots[boardRowIndex][boardColumnIndex];

                // Columns can only have 1 set of linked tiles due to tiles dropping to fill empty board slots.
                if(slot) {
                    linkedTileCount++;
                    currentLinkedTiles.push({ tile: slot, rowIndex: boardRowIndex, colIndex: boardColumnIndex, isRowMatch: false, isColumnMatch: true});
                }
            }

            currentLinkedTiles.forEach((linkedTile: TileWithGridCoords) => {
                if(this.convertTileNameToNumber(linkedTile.tile.name as TileAliases) === linkedTileCount) {
                    matchesArray.push(linkedTile);
                }
            });
        }
    }

    checkMatchesForDuplicates(matches: TileWithGridCoords[]) {
        for(let matchIndexJ = 0; matchIndexJ < matches.length; matchIndexJ++) {
            const matchJ = matches[matchIndexJ];

            for(let matchIndexK  = 0; matchIndexK < matches.length; matchIndexK++) {
                // skip same index as we don't want to check a match against itself.
                if(matchIndexK === matchIndexJ) continue;

                const matchK = matches[matchIndexK];

                if(matchJ.tile.getGuid() === matchK.tile.getGuid()) {
                    // merge the matching axis bools.
                    if(!matchJ.isRowMatch) {
                        matchJ.isRowMatch = matchK.isRowMatch;
                    }
                    if(!matchJ.isColumnMatch) {
                        matchJ.isColumnMatch = matchK.isColumnMatch;
                    }

                    matches.splice(matchIndexK, 1);
                }
            }
        }
    }

    destroyMatchingTiles(matches: TileWithGridCoords[]) {
        if(matches.length) {
            matches.forEach((match) => {
                // NOTE(matt): Do explosion stuff here.
                if(match.tile) {
                    this.app.fire(constants.ANIM_TILE_DESTROY, match.tile, match.tile.destroy.bind(match.tile));
                    gameModel.boardSlots[match.rowIndex][match.colIndex] = null;
                }
            });
        }
    }

    moveRemainingColumnTiles(targetColumnIndex: number) {
        // Edit the boardSlots 2d entity array in-place to move entity tiles in the target column and fill any null slots below them.

        // Step through the rows in reverse order, if we encounter a null slot, save the row index and look for the next entity
        // and place that entity into the first null slot we found.
        // Then reset the rowIndex and start again until no more entities are found after a null slot.
        let nullRowIndex = -1;
        let tilesMoved = 0;
        for(let rowIndex = gameModel.boardSlots.length-1; rowIndex >= 0; rowIndex--) {
            const slot = gameModel.boardSlots[rowIndex][targetColumnIndex];

            // first null slot found.
            if(slot === null && nullRowIndex < 0) {
                    nullRowIndex = rowIndex;
                    continue;
            }

            // if we are here then we have already found a null slot and are searching 
            // for the next entity to place into the null slot.
            if(slot !== null && nullRowIndex > -1) {
                tilesMoved++;
                gameModel.boardSlots[nullRowIndex][targetColumnIndex] = slot;
                gameModel.boardSlots[rowIndex][targetColumnIndex] = null;

                this.app.fire(constants.ANIM_TILE_DROP, slot, gameModel.boardSlotPositions[nullRowIndex][targetColumnIndex], ()=>{});

                // reset the rowIndex to start the process again.
                nullRowIndex = -1;
                rowIndex = gameModel.boardSlots.length-1;
            }
        }

        if(tilesMoved === 0) {
            // No tiles to animate so let's move on.
            this.app.fire(constants.ANIM_DROPS_FINISHED);
        }
    }

    // Matching utils
    convertTileNameToNumber(tileName: TileAliases) {
        const { tileNames } = gameModel;
        return tileNames.indexOf(tileName)+1;
    }
}

pc.registerScript(TileMatcher);